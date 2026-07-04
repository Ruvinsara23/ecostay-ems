import { describe, expect, it } from 'vitest';
import type { RoomLatest } from '@/rooms/room-data-source';
import { AutomationDeps, AutomationLogEntry, runAutomation } from './automation';

const NOW = 2_000_000_000_000;

function makeDeps(options: {
  rooms: Record<string, RoomLatest | null>;
  lastStates?: Record<string, string>;
  enabled?: Record<string, boolean>;
}) {
  const lastStates: Record<string, string> = { ...(options.lastStates ?? {}) };
  const commandWrites: Array<{ key: string; commands: Record<string, boolean> }> = [];
  const log: AutomationLogEntry[] = [];
  const deps: AutomationDeps = {
    async listRooms() {
      return Object.keys(options.rooms).map((key) => {
        const [propertyId, roomId] = key.split('/');
        return { propertyId, roomId };
      });
    },
    async readLatest(propertyId, roomId) {
      return options.rooms[`${propertyId}/${roomId}`] ?? null;
    },
    async getLastOccupancyState(propertyId, roomId) {
      return lastStates[`${propertyId}/${roomId}`] ?? null;
    },
    async setLastOccupancyState(propertyId, roomId, state) {
      lastStates[`${propertyId}/${roomId}`] = state;
    },
    async isAutomationEnabled(propertyId, roomId) {
      return options.enabled?.[`${propertyId}/${roomId}`] ?? false;
    },
    async writeCutoffCommands(propertyId, roomId) {
      commandWrites.push({
        key: `${propertyId}/${roomId}`,
        commands: { lights: false, exhaustFan: false },
      });
    },
    async appendAutomationLog(propertyId, entry) {
      log.push(entry);
    },
  };
  return { deps, lastStates, commandWrites, log };
}

const fresh = (state: string): RoomLatest => ({
  occupancyState: state as RoomLatest['occupancyState'],
  updatedAt: NOW - 5_000,
});

describe('runAutomation', () => {
  it('cuts lights + fan once on the transition into VACANT_CONFIRMED (enabled room)', async () => {
    const { deps, commandWrites, log, lastStates } = makeDeps({
      rooms: { 'property_001/room_001': fresh('VACANT_CONFIRMED') },
      lastStates: { 'property_001/room_001': 'EXIT_PENDING' },
      enabled: { 'property_001/room_001': true },
    });

    const report = await runAutomation(deps, NOW);

    expect(commandWrites).toEqual([
      { key: 'property_001/room_001', commands: { lights: false, exhaustFan: false } },
    ]);
    expect(log).toEqual([
      {
        roomId: 'room_001',
        action: 'vacancy-cutoff',
        relays: ['lights', 'exhaustFan'],
        fromState: 'EXIT_PENDING',
        toState: 'VACANT_CONFIRMED',
        at: NOW,
      },
    ]);
    expect(lastStates['property_001/room_001']).toBe('VACANT_CONFIRMED');
    expect(report.cutoffs).toBe(1);
  });

  it('does nothing on later ticks in the same vacancy — a manual override survives', async () => {
    const { deps, commandWrites, log } = makeDeps({
      rooms: { 'property_001/room_001': fresh('VACANT_CONFIRMED') },
      lastStates: { 'property_001/room_001': 'VACANT_CONFIRMED' },
      enabled: { 'property_001/room_001': true },
    });

    const report = await runAutomation(deps, NOW);

    expect(commandWrites).toEqual([]);
    expect(log).toEqual([]);
    expect(report.cutoffs).toBe(0);
  });

  it('records the transition but acts on nothing when automation is disabled or unset', async () => {
    const { deps, commandWrites, lastStates } = makeDeps({
      rooms: { 'property_001/room_001': fresh('VACANT_CONFIRMED') },
      lastStates: { 'property_001/room_001': 'EXIT_PENDING' },
    });

    await runAutomation(deps, NOW);

    expect(commandWrites).toEqual([]);
    expect(lastStates['property_001/room_001']).toBe('VACANT_CONFIRMED');
  });

  it('other transitions update state without any action', async () => {
    const { deps, commandWrites, lastStates } = makeDeps({
      rooms: { 'property_001/room_001': fresh('OCCUPIED_ACTIVE') },
      lastStates: { 'property_001/room_001': 'ENTRY_DETECTED' },
      enabled: { 'property_001/room_001': true },
    });

    await runAutomation(deps, NOW);

    expect(commandWrites).toEqual([]);
    expect(lastStates['property_001/room_001']).toBe('OCCUPIED_ACTIVE');
  });

  it('ignores stale and never-reported rooms entirely (no state tracking on frozen data)', async () => {
    const { deps, commandWrites, lastStates } = makeDeps({
      rooms: {
        'property_001/room_001': { occupancyState: 'VACANT_CONFIRMED', updatedAt: NOW - 200_000 },
        'property_001/room_002': null,
      },
      lastStates: { 'property_001/room_001': 'EXIT_PENDING' },
      enabled: { 'property_001/room_001': true },
    });

    await runAutomation(deps, NOW);

    expect(commandWrites).toEqual([]);
    expect(lastStates['property_001/room_001']).toBe('EXIT_PENDING'); // untouched
  });

  it('acts on a late-observed transition (runtime was down during the change)', async () => {
    const { deps, commandWrites } = makeDeps({
      rooms: { 'property_001/room_001': fresh('VACANT_CONFIRMED') },
      lastStates: { 'property_001/room_001': 'OCCUPIED_SLEEPING' },
      enabled: { 'property_001/room_001': true },
    });

    const report = await runAutomation(deps, NOW);
    expect(commandWrites).toHaveLength(1);
    expect(report.cutoffs).toBe(1);
  });

  it('first-ever observation just records state (no phantom transition from null)', async () => {
    const { deps, commandWrites, lastStates } = makeDeps({
      rooms: { 'property_001/room_001': fresh('VACANT_CONFIRMED') },
      enabled: { 'property_001/room_001': true },
    });

    await runAutomation(deps, NOW);

    expect(commandWrites).toEqual([]); // no known previous state — don't guess a transition
    expect(lastStates['property_001/room_001']).toBe('VACANT_CONFIRMED');
  });
});
