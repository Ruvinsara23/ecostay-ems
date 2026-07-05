import { describe, expect, it } from 'vitest';
import type { DeviceCommands } from '@/telemetry/contract';
import type { RoomLatest } from './room-data-source';
import { FakeRoomDataSource } from './fake-room-data-source';

const SNAPSHOT: RoomLatest = {
  temperature: 27.5,
  humidity: 62,
  occupancyState: 'OCCUPIED_ACTIVE',
  updatedAt: 1_751_600_000_000,
};

describe('FakeRoomDataSource', () => {
  it('reports null immediately for a room that has never reported', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<RoomLatest | null> = [];
    source.subscribeLatest('property_001', 'room_001', (latest) => emissions.push(latest));
    expect(emissions).toEqual([null]);
  });

  it('reports the current snapshot immediately on subscribe', () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', SNAPSHOT);
    const emissions: Array<RoomLatest | null> = [];
    source.subscribeLatest('property_001', 'room_001', (latest) => emissions.push(latest));
    expect(emissions).toEqual([SNAPSHOT]);
  });

  it('pushes every new snapshot to subscribers', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<RoomLatest | null> = [];
    source.subscribeLatest('property_001', 'room_001', (latest) => emissions.push(latest));

    source.emitLatest('property_001', 'room_001', SNAPSHOT);
    source.emitLatest('property_001', 'room_001', { ...SNAPSHOT, temperature: 28.1 });

    expect(emissions).toHaveLength(3); // initial null + two updates
    expect(emissions[2]?.temperature).toBe(28.1);
  });

  it('stops notifying after unsubscribe', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<RoomLatest | null> = [];
    const unsubscribe = source.subscribeLatest('property_001', 'room_001', (latest) =>
      emissions.push(latest),
    );
    unsubscribe();
    source.emitLatest('property_001', 'room_001', SNAPSHOT);
    expect(emissions).toEqual([null]);
  });

  it('keeps rooms isolated from each other', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<RoomLatest | null> = [];
    source.subscribeLatest('property_001', 'room_001', (latest) => emissions.push(latest));
    source.emitLatest('property_001', 'room_002', SNAPSHOT);
    expect(emissions).toEqual([null]);
  });

  it('returns the configured accessible rooms', async () => {
    const source = new FakeRoomDataSource();
    source.setAccessibleRooms([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        propertyName: 'EcoStay Property',
        roomName: 'Room 1',
      },
    ]);
    const rooms = await source.listAccessibleRooms({
      uid: 'fake-uid',
      email: 'owner@ecostay.test',
      role: 'owner',
    });
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomName).toBe('Room 1');
  });

  it('reports the configured server-time offset immediately, and again on change', () => {
    const source = new FakeRoomDataSource();
    source.setServerTimeOffset(1_528_000);
    const offsets: number[] = [];
    source.subscribeServerTimeOffset((offset) => offsets.push(offset));
    source.setServerTimeOffset(-4_000);
    expect(offsets).toEqual([1_528_000, -4_000]);
  });

  it('defaults the server-time offset to zero', () => {
    const source = new FakeRoomDataSource();
    const offsets: number[] = [];
    source.subscribeServerTimeOffset((offset) => offsets.push(offset));
    expect(offsets).toEqual([0]);
  });

  it('returns no rooms by default (owner with no assignment)', async () => {
    const source = new FakeRoomDataSource();
    const rooms = await source.listAccessibleRooms({
      uid: 'fake-uid',
      email: 'owner@ecostay.test',
      role: 'owner',
    });
    expect(rooms).toEqual([]);
  });

  it('reports device commands immediately and echoes writes to subscribers', async () => {
    const source = new FakeRoomDataSource();
    source.emitDeviceCommands('property_001', 'room_001', { lights: true });
    const emissions: DeviceCommands[] = [];
    source.subscribeDeviceCommands('property_001', 'room_001', (commands) =>
      emissions.push(commands),
    );
    expect(emissions).toEqual([{ lights: true }]);

    await source.setDeviceCommand('property_001', 'room_001', 'exhaustFan', true);

    expect(emissions[1]).toEqual({ lights: true, exhaustFan: true });
  });

  it('serves energy history filtered to the requested window, live', () => {
    const source = new FakeRoomDataSource();
    source.emitEnergyHistory('property_001', 'room_001', [
      { energy: 1.0, power: 4.0, sampledAt: 1_000 },
      { energy: 1.1, power: 4.2, sampledAt: 5_000 },
    ]);
    const emissions: number[][] = [];
    source.subscribeEnergyHistory('property_001', 'room_001', 2_000, (samples) =>
      emissions.push(samples.map((s) => s.sampledAt)),
    );
    expect(emissions).toEqual([[5_000]]); // sample before the window excluded

    source.emitEnergyHistory('property_001', 'room_001', [
      { energy: 1.0, power: 4.0, sampledAt: 1_000 },
      { energy: 1.1, power: 4.2, sampledAt: 5_000 },
      { energy: 1.2, power: 4.4, sampledAt: 9_000 },
    ]);
    expect(emissions[1]).toEqual([5_000, 9_000]);
  });

  it('serves the property tariff category (null until set), live', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<string | null> = [];
    source.subscribeTariffCategory('property_001', (category) => emissions.push(category));
    source.setTariffCategory('property_001', 'H-1');
    expect(emissions).toEqual([null, 'H-1']);
  });

  it('serves daily aggregates keyed by date, live', () => {
    const source = new FakeRoomDataSource();
    source.emitDailyAggregates('property_001', 'room_001', {
      '2026-07-03': { kWhUsed: 0.4, occupiedMinutes: 300 },
    });
    const emissions: string[][] = [];
    source.subscribeDailyAggregates('property_001', 'room_001', (byDate) =>
      emissions.push(Object.keys(byDate)),
    );
    expect(emissions).toEqual([['2026-07-03']]);
  });

  it('serves property alerts live and applies acknowledgements', async () => {
    const source = new FakeRoomDataSource();
    source.emitAlerts('property_001', [
      {
        id: 'a1',
        roomId: 'room_001',
        type: 'gas',
        severity: 'critical',
        value: 452,
        startedAt: 1_000,
      },
    ]);
    const emissions: Array<Array<{ id: string; acknowledgedBy?: string }>> = [];
    source.subscribeAlerts('property_001', (alerts) => emissions.push(alerts));
    expect(emissions[0]).toHaveLength(1);

    await source.acknowledgeAlert('property_001', 'a1', 'uid-owner');

    expect(emissions[1][0].acknowledgedBy).toBe('uid-owner');
  });

  it('reports automation-enabled (default false) and echoes changes', async () => {
    const source = new FakeRoomDataSource();
    const emissions: boolean[] = [];
    source.subscribeAutomationEnabled('property_001', 'room_001', (enabled) =>
      emissions.push(enabled),
    );
    await source.setAutomationEnabled('property_001', 'room_001', true);
    expect(emissions).toEqual([false, true]);
  });

  it('rejects a command when told to fail, without changing state', async () => {
    const source = new FakeRoomDataSource();
    source.emitDeviceCommands('property_001', 'room_001', { lights: false });
    const emissions: DeviceCommands[] = [];
    source.subscribeDeviceCommands('property_001', 'room_001', (commands) =>
      emissions.push(commands),
    );
    source.failNextCommand();

    await expect(
      source.setDeviceCommand('property_001', 'room_001', 'lights', true),
    ).rejects.toThrow();

    expect(emissions).toEqual([{ lights: false }]); // no echo, no state change
  });
});
