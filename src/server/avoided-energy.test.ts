import { describe, expect, it } from 'vitest';
import type { OccupancyState } from '@/telemetry/contract';
import {
  MAX_CREDIT_MS_PER_VACANCY,
  NOMINAL_SAMPLE_INTERVAL_MS,
  avoidedEnergyKWh,
} from './avoided-energy';
import { colomboDayWindow } from './colombo-time';
import type { EnergySample, SampleRelays } from './sample-energy';

const DAY = colomboDayWindow('2026-07-20');
/** Colombo o'clock → UTC ms. 10:00 = day window, 20:00 = peak, 02:00 = offPeak. */
const at = (hour: number, minute = 0): number =>
  DAY.startMs + hour * 3_600_000 + minute * 60_000;

const LIGHTS_W = 60;
const FAN_W = 40;
const WATTAGES = { lights: LIGHTS_W, exhaustFan: FAN_W };

function sample(
  sampledAt: number,
  occupancyState: OccupancyState,
  relays?: SampleRelays,
): EnergySample {
  const s: EnergySample = { energy: 1, power: 10, sampledAt, occupancyState };
  if (relays) s.relays = relays;
  return s;
}

/** kWh a circuit earns over `minutes` at its rated wattage. */
const kWh = (watts: number, minutes: number): number => (watts * (minutes / 60)) / 1000;

const run = (samples: EnergySample[], windowStartMs = DAY.startMs) =>
  avoidedEnergyKWh(samples, { wattages: WATTAGES, windowStartMs });

describe('avoidedEnergyKWh — evidence-armed credit', () => {
  it('credits an armed circuit for each vacant interval after the guest leaves', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 5), 'VACANT_CONFIRMED', { lights: false }),
      sample(at(10, 10), 'VACANT_CONFIRMED', { lights: false }),
    ]);

    // Two 5-minute intervals of the lights circuit only — the fan was never on.
    expect(result.total).toBeCloseTo(kWh(LIGHTS_W, 10), 9);
  });

  it('never credits a circuit that was not running while the guest was there', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: false, exhaustFan: false }),
      sample(at(10, 5), 'VACANT_CONFIRMED', { lights: false, exhaustFan: false }),
      sample(at(10, 10), 'VACANT_CONFIRMED', { lights: false, exhaustFan: false }),
    ]);

    expect(result.total).toBe(0);
  });

  it('earns nothing for a room that was never occupied, however long it sits vacant', () => {
    const samples = Array.from({ length: 200 }, (_, i) =>
      sample(at(0, i * 5), 'VACANT_CONFIRMED', { lights: false, exhaustFan: false }),
    );

    expect(run(samples).total).toBe(0);
  });

  it('credits EXIT_PENDING even though ADR-0014 retains the command as true', () => {
    // The firmware holds the relay off during an unresolved exit while the
    // Firebase command still reads true — physical off-ness comes from the
    // occupancy policy, not the command boolean.
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 5), 'EXIT_PENDING', { lights: true }),
    ]);

    expect(result.total).toBeCloseTo(kWh(LIGHTS_W, 5), 9);
  });

  it('does not credit OCCUPIED_SLEEPING — the guest is present (ADR-0014)', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 5), 'OCCUPIED_SLEEPING', { lights: true }),
      sample(at(10, 10), 'OCCUPIED_SLEEPING', { lights: true }),
    ]);

    expect(result.total).toBe(0);
  });

  it('stops crediting when the guest returns and turns the circuit off', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 5), 'VACANT_CONFIRMED', { lights: false }), // credited
      sample(at(10, 10), 'OCCUPIED_ACTIVE', { lights: false }), // back, and off
      sample(at(10, 15), 'VACANT_CONFIRMED', { lights: false }), // nothing armed
    ]);

    expect(result.total).toBeCloseTo(kWh(LIGHTS_W, 5), 9);
  });

  it('re-arms when the returning guest switches the circuit back on', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 5), 'VACANT_CONFIRMED', { lights: false }),
      sample(at(10, 10), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 15), 'VACANT_CONFIRMED', { lights: false }),
    ]);

    expect(result.total).toBeCloseTo(kWh(LIGHTS_W, 10), 9);
  });

  it('caps a single continuous vacancy', () => {
    const capMinutes = MAX_CREDIT_MS_PER_VACANCY / 60_000;
    // Far more vacant samples than the cap allows.
    const samples: EnergySample[] = [sample(at(0, 0), 'OCCUPIED_ACTIVE', { lights: true })];
    for (let i = 1; i <= capMinutes / 5 + 50; i++) {
      samples.push(sample(at(0, i * 5), 'VACANT_CONFIRMED', { lights: false }));
    }

    expect(run(samples).total).toBeCloseTo(kWh(LIGHTS_W, capMinutes), 9);
  });

  it('gives each vacancy its own cap budget', () => {
    const capMinutes = MAX_CREDIT_MS_PER_VACANCY / 60_000;
    const samples: EnergySample[] = [];
    let minute = 0;
    for (let vacancy = 0; vacancy < 2; vacancy++) {
      samples.push(sample(at(0, minute), 'OCCUPIED_ACTIVE', { lights: true }));
      minute += 5;
      for (let i = 0; i < capMinutes / 5 + 20; i++) {
        samples.push(sample(at(0, minute), 'VACANT_CONFIRMED', { lights: false }));
        minute += 5;
      }
    }

    expect(run(samples).total).toBeCloseTo(kWh(LIGHTS_W, capMinutes * 2), 9);
  });

  it('clamps an oversized gap to the nominal sample interval', () => {
    const nominalMinutes = NOMINAL_SAMPLE_INTERVAL_MS / 60_000;
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 45), 'VACANT_CONFIRMED', { lights: false }), // 45-minute gap
    ]);

    expect(result.total).toBeCloseTo(kWh(LIGHTS_W, nominalMinutes), 9);
  });

  it('treats a missing relay reading as unknown and refuses to arm', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE'), // no relays block at all
      sample(at(10, 5), 'VACANT_CONFIRMED', { lights: false }),
    ]);

    expect(result.total).toBe(0);
  });

  it('clears the arm when the device reboots to VACANT', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 5), 'VACANT', { lights: false }), // boot/reset — continuity lost
      sample(at(10, 10), 'VACANT_CONFIRMED', { lights: false }),
    ]);

    expect(result.total).toBe(0);
  });

  it('credits both controlled circuits independently', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true, exhaustFan: true }),
      sample(at(10, 5), 'VACANT_CONFIRMED', { lights: false, exhaustFan: false }),
    ]);

    expect(result.total).toBeCloseTo(kWh(LIGHTS_W + FAN_W, 5), 9);
  });

  it('ignores a circuit with no configured wattage', () => {
    const result = avoidedEnergyKWh(
      [
        sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true, exhaustFan: true }),
        sample(at(10, 5), 'VACANT_CONFIRMED', { lights: false, exhaustFan: false }),
      ],
      { wattages: { lights: LIGHTS_W }, windowStartMs: DAY.startMs },
    );

    expect(result.total).toBeCloseTo(kWh(LIGHTS_W, 5), 9);
  });

  it('arms from samples before the window but credits only inside it', () => {
    // The day-boundary lookback: the guest left late on the previous day.
    const result = run(
      [
        sample(DAY.startMs - 10 * 60_000, 'OCCUPIED_ACTIVE', { lights: true }),
        sample(DAY.startMs - 5 * 60_000, 'VACANT_CONFIRMED', { lights: false }),
        sample(DAY.startMs, 'VACANT_CONFIRMED', { lights: false }),
        sample(DAY.startMs + 5 * 60_000, 'VACANT_CONFIRMED', { lights: false }),
      ],
      DAY.startMs,
    );

    // Only the two in-window intervals are credited, but the arm survived midnight.
    expect(result.total).toBeCloseTo(kWh(LIGHTS_W, 10), 9);
  });

  it('splits credit across the TOU windows by sample time', () => {
    const result = run([
      sample(at(10, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(10, 5), 'VACANT_CONFIRMED', { lights: false }), // 10:05 → day
      sample(at(20, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(20, 5), 'VACANT_CONFIRMED', { lights: false }), // 20:05 → peak
      sample(at(2, 0), 'OCCUPIED_ACTIVE', { lights: true }),
      sample(at(2, 5), 'VACANT_CONFIRMED', { lights: false }), // 02:05 → offPeak
    ]);

    expect(result.day).toBeCloseTo(kWh(LIGHTS_W, 5), 9);
    expect(result.peak).toBeCloseTo(kWh(LIGHTS_W, 5), 9);
    expect(result.offPeak).toBeCloseTo(kWh(LIGHTS_W, 5), 9);
    expect(result.total).toBeCloseTo(result.day + result.peak + result.offPeak, 9);
  });

  it('returns zero for an empty sample set', () => {
    expect(run([]).total).toBe(0);
  });
});
