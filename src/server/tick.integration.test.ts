// Emulator-backed proof of the 1-minute tick: alert lifecycle + vacancy-cutoff automation.
import { getApps as getAdminApps, initializeApp as initializeAdminApp } from 'firebase-admin/app';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import { describe, expect, it } from 'vitest';
import { createAlertsDeps, createAutomationDeps } from './admin-deps';
import { AlertRecord, evaluateAlerts } from './alerts';
import { AutomationLogEntry, runAutomation } from './automation';

const PROJECT_ID = 'demo-ecostay';
const NAMESPACE = `${PROJECT_ID}-default-rtdb`;
const DB_EMULATOR_HOST = '127.0.0.1:9000';

process.env.FIREBASE_DATABASE_EMULATOR_HOST = DB_EMULATOR_HOST;

const adminApp =
  getAdminApps()[0] ??
  initializeAdminApp({
    projectId: PROJECT_ID,
    databaseURL: `http://${DB_EMULATOR_HOST}/?ns=${NAMESPACE}`,
  });
const db = getAdminDatabase(adminApp);

const NOW = 2_000_000_000_000;
const ROOM = 'properties/property_001/rooms/room_001';

async function seedRoom(latest: Record<string, unknown>) {
  await db.ref().set(null);
  await db.ref().update({
    'ops/roomIndex/property_001/room_001': true,
    [`${ROOM}/latest`]: latest,
  });
}

function alertsOf(val: Record<string, AlertRecord> | null): AlertRecord[] {
  return Object.values(val ?? {});
}

describe('tick against the RTDB emulator', () => {
  it('gas alert: opens once, dedupes, then auto-resolves', async () => {
    await seedRoom({ gas: 452, updatedAt: NOW - 5_000 });
    const deps = createAlertsDeps(db);

    await evaluateAlerts(deps, NOW);
    await evaluateAlerts(deps, NOW + 60_000); // second tick must not duplicate

    let alerts = alertsOf((await db.ref('properties/property_001/alerts').get()).val());
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ type: 'gas', severity: 'critical', value: 452 });
    expect(alerts[0].resolvedAt).toBeUndefined();

    await db.ref(`${ROOM}/latest`).update({ gas: 120, updatedAt: NOW + 115_000 });
    await evaluateAlerts(deps, NOW + 120_000);

    alerts = alertsOf((await db.ref('properties/property_001/alerts').get()).val());
    expect(alerts).toHaveLength(1);
    expect(alerts[0].resolvedAt).toBe(NOW + 120_000);
    expect((await db.ref('ops/openAlerts').get()).val()).toBeNull();
  });

  it('offline alert opens on silence and resolves when the device returns', async () => {
    await seedRoom({ gas: 100, updatedAt: NOW - 200_000 });
    const deps = createAlertsDeps(db);

    await evaluateAlerts(deps, NOW);
    let alerts = alertsOf((await db.ref('properties/property_001/alerts').get()).val());
    expect(alerts.map((a) => a.type)).toEqual(['device-offline']);

    await db.ref(`${ROOM}/latest`).update({ updatedAt: NOW + 55_000 });
    await evaluateAlerts(deps, NOW + 60_000);

    alerts = alertsOf((await db.ref('properties/property_001/alerts').get()).val());
    expect(alerts[0].resolvedAt).toBe(NOW + 60_000);
  });

  it('vacancy cutoff: transition writes the two commands + log; manual re-on survives the next tick', async () => {
    await seedRoom({ occupancyState: 'EXIT_PENDING', updatedAt: NOW - 5_000 });
    await db.ref().update({
      [`${ROOM}/settings/automationEnabled`]: true,
      [`${ROOM}/devices`]: { lights: true, exhaustFan: true, waterPump: true },
    });
    const deps = createAutomationDeps(db);

    await runAutomation(deps, NOW); // records EXIT_PENDING
    await db
      .ref(`${ROOM}/latest`)
      .update({ occupancyState: 'VACANT_CONFIRMED', updatedAt: NOW + 55_000 });
    const report = await runAutomation(deps, NOW + 60_000);
    expect(report.cutoffs).toBe(1);

    const devices = (await db.ref(`${ROOM}/devices`).get()).val();
    expect(devices).toEqual({ lights: false, exhaustFan: false, waterPump: true }); // pump untouched

    const log = Object.values(
      ((await db.ref('properties/property_001/automationLog').get()).val() ?? {}) as Record<
        string,
        AutomationLogEntry
      >,
    );
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      action: 'vacancy-cutoff',
      fromState: 'EXIT_PENDING',
      toState: 'VACANT_CONFIRMED',
    });

    // Owner manually re-enables lights during the same vacancy…
    await db.ref(`${ROOM}/devices/lights`).set(true);
    await db.ref(`${ROOM}/latest`).update({ updatedAt: NOW + 115_000 });
    const second = await runAutomation(deps, NOW + 120_000);

    // …and the next tick does NOT fight it (epoch precedence).
    expect(second.cutoffs).toBe(0);
    expect((await db.ref(`${ROOM}/devices/lights`).get()).val()).toBe(true);
  });

  it('automation disabled → transition logged nowhere, commands untouched', async () => {
    await seedRoom({ occupancyState: 'EXIT_PENDING', updatedAt: NOW - 5_000 });
    await db.ref(`${ROOM}/devices`).set({ lights: true });
    const deps = createAutomationDeps(db);

    await runAutomation(deps, NOW);
    await db
      .ref(`${ROOM}/latest`)
      .update({ occupancyState: 'VACANT_CONFIRMED', updatedAt: NOW + 55_000 });
    await runAutomation(deps, NOW + 60_000);

    expect((await db.ref(`${ROOM}/devices/lights`).get()).val()).toBe(true);
    expect((await db.ref('properties/property_001/automationLog').get()).val()).toBeNull();
  });
});
