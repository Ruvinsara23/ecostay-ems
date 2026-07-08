import type { Database } from 'firebase-admin/database';
import type { RoomLatest } from '@/rooms/room-data-source';
import type { AlertsDeps, AlertType } from './alerts';
import type { AutomationDeps } from './automation';
import type { RollupDeps } from './rollup';
import type { EnergySample, SamplerDeps } from './sample-energy';

/**
 * Rooms come from `ops/roomIndex/{pid}/{rid}: true` — a tiny Admin-only registry
 * (seeder-maintained today, Admin UI later). Reading the `properties` tree instead
 * would download every room's growing history on every tick.
 */
export async function listIndexedRooms(
  db: Database,
): Promise<Array<{ propertyId: string; roomId: string }>> {
  const index = (await db.ref('ops/roomIndex').get()).val() as Record<
    string,
    Record<string, true>
  > | null;
  const rooms: Array<{ propertyId: string; roomId: string }> = [];
  for (const propertyId of Object.keys(index ?? {}).sort()) {
    for (const roomId of Object.keys(index?.[propertyId] ?? {}).sort()) {
      rooms.push({ propertyId, roomId });
    }
  }
  return rooms;
}

async function readLatest(db: Database, propertyId: string, roomId: string) {
  const snapshot = await db.ref(`properties/${propertyId}/rooms/${roomId}/latest`).get();
  return (snapshot.val() as RoomLatest | null) ?? null;
}

export function createSamplerDeps(db: Database): SamplerDeps {
  return {
    listRooms: () => listIndexedRooms(db),
    readLatest: (propertyId, roomId) => readLatest(db, propertyId, roomId),

    async appendEnergySample(propertyId, roomId, sample) {
      await db.ref(`properties/${propertyId}/energyHistory/${roomId}`).push(sample);
    },
  };
}

export function createAlertsDeps(db: Database): AlertsDeps {
  return {
    listRooms: () => listIndexedRooms(db),
    readLatest: (propertyId, roomId) => readLatest(db, propertyId, roomId),

    async readAlertThresholds(propertyId) {
      return (await db.ref(`properties/${propertyId}/settings/alertThresholds`).get()).val();
    },

    async getOpenAlerts(propertyId, roomId) {
      const snapshot = await db.ref(`ops/openAlerts/${propertyId}/${roomId}`).get();
      return (snapshot.val() as Partial<Record<AlertType, string>> | null) ?? {};
    },

    async openAlert(propertyId, roomId, alert) {
      const alertRef = db.ref(`properties/${propertyId}/alerts`).push();
      await db.ref().update({
        [`properties/${propertyId}/alerts/${alertRef.key}`]: alert,
        [`ops/openAlerts/${propertyId}/${roomId}/${alert.type}`]: alertRef.key,
      });
    },

    async resolveAlert(propertyId, roomId, type, alertId, resolvedAt) {
      await db.ref().update({
        [`properties/${propertyId}/alerts/${alertId}/resolvedAt`]: resolvedAt,
        [`ops/openAlerts/${propertyId}/${roomId}/${type}`]: null,
      });
    },
  };
}

export function createAutomationDeps(db: Database): AutomationDeps {
  return {
    listRooms: () => listIndexedRooms(db),
    readLatest: (propertyId, roomId) => readLatest(db, propertyId, roomId),

    async getLastOccupancyState(propertyId, roomId) {
      const snapshot = await db.ref(`ops/lastOccupancy/${propertyId}/${roomId}`).get();
      return (snapshot.val() as string | null) ?? null;
    },

    async setLastOccupancyState(propertyId, roomId, state) {
      await db.ref(`ops/lastOccupancy/${propertyId}/${roomId}`).set(state);
    },

    async isAutomationEnabled(propertyId, roomId) {
      const snapshot = await db
        .ref(`properties/${propertyId}/rooms/${roomId}/settings/automationEnabled`)
        .get();
      return snapshot.val() === true;
    },

    async writeCutoffCommands(propertyId, roomId) {
      // lights + exhaustFan only — mainRelay is untouchable (ADR-0003).
      await db.ref(`properties/${propertyId}/rooms/${roomId}/devices`).update({
        lights: false,
        exhaustFan: false,
      });
    },

    async appendAutomationLog(propertyId, entry) {
      await db.ref(`properties/${propertyId}/automationLog`).push(entry);
    },
  };
}

export function createRollupDeps(db: Database): RollupDeps {
  const historyRef = (propertyId: string, roomId: string) =>
    db.ref(`properties/${propertyId}/energyHistory/${roomId}`);

  return {
    listRooms: () => listIndexedRooms(db),

    async readCircuitWattages(propertyId) {
      const raw = (
        await db.ref(`properties/${propertyId}/settings/circuitWattages`).get()
      ).val() as { lights?: number; exhaustFan?: number } | null;
      if (!raw || typeof raw.lights !== 'number' || typeof raw.exhaustFan !== 'number') {
        return null;
      }
      return { lights: raw.lights, exhaustFan: raw.exhaustFan };
    },

    async readSamplesInWindow(propertyId, roomId, startMs, endMs) {
      const snapshot = await historyRef(propertyId, roomId)
        .orderByChild('sampledAt')
        .startAt(startMs)
        .endAt(endMs - 1)
        .get();
      return Object.values((snapshot.val() ?? {}) as Record<string, EnergySample>);
    },

    async writeDailyAggregate(propertyId, roomId, dateKey, aggregate) {
      await db
        .ref(`properties/${propertyId}/dailyAggregates/${roomId}/${dateKey}`)
        .set(aggregate);
    },

    async readSampleKeysBefore(propertyId, roomId, cutoffMs) {
      const snapshot = await historyRef(propertyId, roomId)
        .orderByChild('sampledAt')
        .endAt(cutoffMs - 1)
        .get();
      return Object.keys((snapshot.val() ?? {}) as Record<string, unknown>);
    },

    async deleteSamples(propertyId, roomId, sampleKeys) {
      const updates: Record<string, null> = {};
      for (const key of sampleKeys) updates[key] = null;
      await historyRef(propertyId, roomId).update(updates);
    },
  };
}
