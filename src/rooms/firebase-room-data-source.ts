import {
  Database,
  get,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  serverTimestamp,
  set,
  startAt,
  update,
} from 'firebase/database';
import { parseAlertThresholds } from '@/alerts/thresholds';
import { DEVICE_COMMAND_KEYS, DeviceCommands } from '@/telemetry/contract';
import type {
  AlertView,
  DailyAggregateView,
  EnergyHistorySample,
  EvaluationRun,
  RoomDataSource,
  RoomLatest,
  RoomRef,
} from './room-data-source';

type PropertyNode = {
  name?: string;
  rooms?: Record<string, { name?: string }>;
};

function roomsOf(propertyId: string, property: PropertyNode | null): RoomRef[] {
  if (!property?.rooms) return [];
  return Object.keys(property.rooms)
    .sort()
    .map((roomId) => ({
      propertyId,
      roomId,
      propertyName: property.name,
      roomName: property.rooms?.[roomId]?.name,
    }));
}

/**
 * The real RoomDataSource over firebase/database. Reads the firmware-written
 * `latest` snapshot (docs/firmware-contract.md) — path shape is the contract's,
 * never invented here.
 */
export function createFirebaseRoomDataSource(db: Database): RoomDataSource {
  return {
    async listAccessibleRooms(session) {
      if (session.role === 'admin') {
        const all = (await get(ref(db, 'properties'))).val() as Record<
          string,
          PropertyNode
        > | null;
        return Object.keys(all ?? {})
          .sort()
          .flatMap((propertyId) => roomsOf(propertyId, all?.[propertyId] ?? null));
      }
      const index = (await get(ref(db, `users/${session.uid}/properties`))).val() as Record<
        string,
        true
      > | null;
      const propertyIds = Object.keys(index ?? {}).sort();
      const nodes = await Promise.all(
        propertyIds.map(
          async (propertyId) =>
            (await get(ref(db, `properties/${propertyId}`))).val() as PropertyNode | null,
        ),
      );
      return propertyIds.flatMap((propertyId, i) => roomsOf(propertyId, nodes[i]));
    },

    subscribeLatest(propertyId, roomId, callback, onError) {
      const latestRef = ref(db, `properties/${propertyId}/rooms/${roomId}/latest`);
      return onValue(
        latestRef,
        (snapshot) => {
          callback(snapshot.exists() ? (snapshot.val() as RoomLatest) : null);
        },
        (error) => {
          // A dropped/denied subscription must surface, never hang as "Loading…" (audit A3).
          console.error('[room-data-source] latest subscription failed', error);
          onError?.();
        },
      );
    },

    subscribeServerTimeOffset(callback) {
      return onValue(ref(db, '.info/serverTimeOffset'), (snapshot) => {
        callback((snapshot.val() as number | null) ?? 0);
      });
    },

    subscribeDeviceCommands(propertyId, roomId, callback) {
      const devicesRef = ref(db, `properties/${propertyId}/rooms/${roomId}/devices`);
      return onValue(devicesRef, (snapshot) => {
        const raw = (snapshot.val() ?? {}) as Record<string, unknown>;
        const commands: DeviceCommands = {};
        for (const key of DEVICE_COMMAND_KEYS) {
          if (typeof raw[key] === 'boolean') commands[key] = raw[key] as boolean;
        }
        callback(commands); // mainRelay never surfaces
      });
    },

    async setDeviceCommand(propertyId, roomId, key, on) {
      await set(ref(db, `properties/${propertyId}/rooms/${roomId}/devices/${key}`), on);
    },

    subscribeAutomationEnabled(propertyId, roomId, callback) {
      const settingRef = ref(
        db,
        `properties/${propertyId}/rooms/${roomId}/settings/automationEnabled`,
      );
      return onValue(settingRef, (snapshot) => callback(snapshot.val() === true));
    },

    async setAutomationEnabled(propertyId, roomId, enabled) {
      await set(
        ref(db, `properties/${propertyId}/rooms/${roomId}/settings/automationEnabled`),
        enabled,
      );
    },

    subscribeEnergyHistory(propertyId, roomId, sinceMs, callback, onError) {
      const windowed = query(
        ref(db, `properties/${propertyId}/energyHistory/${roomId}`),
        orderByChild('sampledAt'),
        startAt(sinceMs),
      );
      return onValue(
        windowed,
        (snapshot) => {
          const samples = Object.values(
            (snapshot.val() ?? {}) as Record<string, EnergyHistorySample>,
          ).sort((a, b) => a.sampledAt - b.sampledAt);
          callback(samples);
        },
        (error) => {
          console.error('[room-data-source] energy-history subscription failed', error);
          onError?.();
        },
      );
    },

    subscribeDailyAggregates(propertyId, roomId, callback, onError) {
      return onValue(
        ref(db, `properties/${propertyId}/dailyAggregates/${roomId}`),
        (snapshot) => {
          callback((snapshot.val() ?? {}) as Record<string, DailyAggregateView>);
        },
        (error) => {
          console.error('[room-data-source] aggregates subscription failed', error);
          onError?.();
        },
      );
    },

    subscribeTariffCategory(propertyId, callback) {
      return onValue(
        ref(db, `properties/${propertyId}/settings/tariffCategory`),
        (snapshot) => callback((snapshot.val() as string | null) ?? null),
      );
    },

    async setTariffCategory(propertyId, category) {
      await set(ref(db, `properties/${propertyId}/settings/tariffCategory`), category);
    },

    subscribeCircuitWattages(propertyId, callback) {
      return onValue(ref(db, `properties/${propertyId}/settings/circuitWattages`), (snapshot) => {
        const raw = snapshot.val() as { lights?: number; exhaustFan?: number } | null;
        callback(
          raw && typeof raw.lights === 'number' && typeof raw.exhaustFan === 'number'
            ? { lights: raw.lights, exhaustFan: raw.exhaustFan }
            : null,
        );
      });
    },

    async setCircuitWattages(propertyId, wattages) {
      await set(ref(db, `properties/${propertyId}/settings/circuitWattages`), wattages);
    },

    subscribeAlertThresholds(propertyId, callback) {
      return onValue(ref(db, `properties/${propertyId}/settings/alertThresholds`), (snapshot) => {
        callback(snapshot.exists() ? parseAlertThresholds(snapshot.val()) : null);
      });
    },

    async setAlertThresholds(propertyId, thresholds) {
      await set(ref(db, `properties/${propertyId}/settings/alertThresholds`), thresholds);
    },

    subscribeAlerts(propertyId, callback, onError) {
      return onValue(
        ref(db, `properties/${propertyId}/alerts`),
        (snapshot) => {
        const raw = (snapshot.val() ?? {}) as Record<string, Omit<AlertView, 'id'>>;
        callback(Object.entries(raw).map(([id, alert]) => ({ ...alert, id })));
        },
        (error) => {
          console.error('[room-data-source] alerts subscription failed', error);
          onError?.();
        },
      );
    },

    async acknowledgeAlert(propertyId, alertId, uid) {
      // Rules allow exactly these two leaves; acknowledgedBy must equal the caller's uid.
      await update(ref(db, `properties/${propertyId}/alerts/${alertId}`), {
        acknowledgedBy: uid,
        acknowledgedAt: serverTimestamp(),
      });
    },

    subscribeEvaluationRuns(propertyId, roomId, callback, onError) {
      return onValue(
        ref(db, `properties/${propertyId}/rooms/${roomId}/evaluationRuns`),
        (snapshot) => {
          const raw = (snapshot.val() ?? {}) as Record<string, Omit<EvaluationRun, 'id'>>;
          callback(Object.entries(raw).map(([id, run]) => ({ ...run, id })));
        },
        (error) => {
          console.error('[room-data-source] evaluation runs subscription failed', error);
          onError?.();
        },
      );
    },

    async startEvaluationRun(propertyId, roomId, input) {
      const automationEnabled = input.label === 'ecostay';
      const runRef = push(ref(db, `properties/${propertyId}/rooms/${roomId}/evaluationRuns`));
      await set(runRef, {
        label: input.label,
        automationEnabled,
        startedAt: serverTimestamp(),
        startEnergyKWh: input.startEnergyKWh,
      });
      // The experiment's control: baseline runs with automation off, EcoStay with it on.
      await set(
        ref(db, `properties/${propertyId}/rooms/${roomId}/settings/automationEnabled`),
        automationEnabled,
      );
      return runRef.key as string;
    },

    async endEvaluationRun(propertyId, roomId, runId, endEnergyKWh) {
      await update(ref(db, `properties/${propertyId}/rooms/${roomId}/evaluationRuns/${runId}`), {
        endedAt: serverTimestamp(),
        endEnergyKWh,
      });
    },

    async deleteEvaluationRun(propertyId, roomId, runId) {
      await set(ref(db, `properties/${propertyId}/rooms/${roomId}/evaluationRuns/${runId}`), null);
    },
  };
}
