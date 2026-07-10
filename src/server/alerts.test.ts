import { describe, expect, it } from 'vitest';
import type { AlertThresholds } from '@/alerts/thresholds';
import type { RoomLatest } from '@/rooms/room-data-source';
import { AlertRecord, AlertsDeps, AlertType, evaluateAlerts } from './alerts';

const NOW = 2_000_000_000_000;

type World = {
  rooms: Record<string, RoomLatest | null>;
  open: Record<string, Partial<Record<AlertType, string>>>; // pid/rid → type → id
  thresholds: Record<string, Partial<AlertThresholds> | null>; // pid → settings
  opened: AlertRecord[];
  resolved: Array<{ type: AlertType; alertId: string; resolvedAt: number }>;
};

function makeDeps(
  rooms: World['rooms'],
  openIndex: World['open'] = {},
  thresholds: World['thresholds'] = {},
) {
  const world: World = { rooms, open: openIndex, thresholds, opened: [], resolved: [] };
  let nextId = 1;
  const deps: AlertsDeps = {
    async listRooms() {
      return Object.keys(rooms).map((key) => {
        const [propertyId, roomId] = key.split('/');
        return { propertyId, roomId };
      });
    },
    async readLatest(propertyId, roomId) {
      return rooms[`${propertyId}/${roomId}`] ?? null;
    },
    async readAlertThresholds(propertyId) {
      return world.thresholds[propertyId] ?? null;
    },
    async getOpenAlerts(propertyId, roomId) {
      return world.open[`${propertyId}/${roomId}`] ?? {};
    },
    async openAlert(propertyId, roomId, alert) {
      world.opened.push(alert);
      const key = `${propertyId}/${roomId}`;
      world.open[key] = { ...(world.open[key] ?? {}), [alert.type]: `id-${nextId++}` };
    },
    async resolveAlert(propertyId, roomId, type, alertId, resolvedAt) {
      world.resolved.push({ type, alertId, resolvedAt });
      const key = `${propertyId}/${roomId}`;
      const forRoom = { ...(world.open[key] ?? {}) };
      delete forRoom[type];
      world.open[key] = forRoom;
    },
  };
  return { deps, world };
}

const fresh = (over: RoomLatest = {}): RoomLatest => ({
  gas: 120,
  temperature: 28,
  waterLevel: 70,
  updatedAt: NOW - 5_000,
  ...over,
});

describe('evaluateAlerts', () => {
  it('opens a critical gas alert above the threshold with the full record', async () => {
    const { deps, world } = makeDeps({ 'property_001/room_001': fresh({ gas: 452 }) });
    const report = await evaluateAlerts(deps, NOW);

    expect(world.opened).toEqual([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        type: 'gas',
        severity: 'critical',
        value: 452,
        startedAt: NOW,
      },
    ]);
    expect(report.opened).toBe(1);
    expect(report.newlyOpened.length).toBe(1);
  });

  it('never duplicates an alert that is already open', async () => {
    const { deps, world } = makeDeps(
      { 'property_001/room_001': fresh({ gas: 452 }) },
      { 'property_001/room_001': { gas: 'id-existing' } },
    );
    const report = await evaluateAlerts(deps, NOW);
    expect(world.opened).toEqual([]);
    expect(report.opened).toBe(0);
    expect(report.open).toBe(1);
  });

  it('auto-resolves an open alert when the condition clears', async () => {
    const { deps, world } = makeDeps(
      { 'property_001/room_001': fresh({ gas: 120 }) },
      { 'property_001/room_001': { gas: 'id-existing' } },
    );
    const report = await evaluateAlerts(deps, NOW);
    expect(world.resolved).toEqual([{ type: 'gas', alertId: 'id-existing', resolvedAt: NOW }]);
    expect(report.resolved).toBe(1);
  });

  it('opens device-offline past 90 s of silence, but not at 60 s', async () => {
    const silent = makeDeps({ 'property_001/room_001': fresh({ updatedAt: NOW - 91_000 }) });
    await evaluateAlerts(silent.deps, NOW);
    expect(silent.world.opened.map((alert) => alert.type)).toEqual(['device-offline']);

    const briefly = makeDeps({ 'property_001/room_001': fresh({ updatedAt: NOW - 60_000 }) });
    await evaluateAlerts(briefly.deps, NOW);
    expect(briefly.world.opened).toEqual([]);
  });

  it("does not judge thresholds on a dead device's frozen values", async () => {
    // Device died mid-alarm: gas frozen at 452, but the data is stale.
    const { deps, world } = makeDeps(
      { 'property_001/room_001': fresh({ gas: 452, updatedAt: NOW - 200_000 }) },
      { 'property_001/room_001': { gas: 'id-mid-alarm' } },
    );
    await evaluateAlerts(deps, NOW);

    expect(world.opened.map((alert) => alert.type)).toEqual(['device-offline']);
    expect(world.resolved.map((r) => r.type)).toEqual(['gas']); // unknown ≠ alarming
  });

  it('ignores rooms that have never reported', async () => {
    const { deps, world } = makeDeps({ 'property_001/room_001': null });
    const report = await evaluateAlerts(deps, NOW);
    expect(world.opened).toEqual([]);
    expect(report).toEqual({ opened: 0, resolved: 0, open: 0, newlyOpened: [] });
  });

  it('opens temperature and water-level warnings at their default thresholds', async () => {
    const { deps, world } = makeDeps({
      'property_001/room_001': fresh({ temperature: 33.5, waterLevel: 15 }),
    });
    await evaluateAlerts(deps, NOW);
    expect(world.opened.map((alert) => [alert.type, alert.severity, alert.value])).toEqual([
      ['temperature', 'warning', 33.5],
      ['water-level', 'warning', 15],
    ]);
  });

  it('uses configured temperature and water-level thresholds per property', async () => {
    const { deps, world } = makeDeps(
      {
        'property_001/room_001': fresh({ temperature: 33.5, waterLevel: 15 }),
        'property_002/room_002': fresh({ temperature: 35.5, waterLevel: 15 }),
      },
      {},
      {
        property_001: { temperatureC: 34, waterLevelPct: 10 },
        property_002: { temperatureC: 35, waterLevelPct: 20 },
      },
    );

    await evaluateAlerts(deps, NOW);

    expect(world.opened.map((alert) => [alert.roomId, alert.type, alert.value])).toEqual([
      ['room_002', 'temperature', 35.5],
      ['room_002', 'water-level', 15],
    ]);
  });

  it('falls back to default thresholds when stored settings are malformed', async () => {
    const { deps, world } = makeDeps(
      { 'property_001/room_001': fresh({ temperature: 33.5, waterLevel: 15 }) },
      {},
      {
        property_001: {
          temperatureC: 'hot' as unknown as number,
          waterLevelPct: -4,
        },
      },
    );

    await evaluateAlerts(deps, NOW);

    expect(world.opened.map((alert) => alert.type)).toEqual(['temperature', 'water-level']);
  });

  it('resolves the offline alert when the device comes back', async () => {
    const { deps, world } = makeDeps(
      { 'property_001/room_001': fresh() },
      { 'property_001/room_001': { 'device-offline': 'id-off' } },
    );
    await evaluateAlerts(deps, NOW);
    expect(world.resolved).toEqual([
      { type: 'device-offline', alertId: 'id-off', resolvedAt: NOW },
    ]);
  });
});
