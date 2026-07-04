// Dev-only device simulator — NOT the demo, NOT production (see scripts/README.md).
// Writes contract-exact `latest` snapshots (docs/firmware-contract.md) on the firmware's
// 3-second cadence so the dashboard can be developed and rehearsed without the ESP32.
// Stop it (Ctrl+C) to exercise the offline/staleness behavior (slice 04).
//
//   GOOGLE_APPLICATION_CREDENTIALS=... node scripts/simulate-device.ts [--ticks 20]
//
// Same env contract as seed.ts (FIREBASE_DATABASE_URL or .env.local, emulator hosts honored).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase, ServerValue } from 'firebase-admin/database';

const PROPERTY_ID = 'property_001';
const ROOM_ID = 'room_001';
const TICK_MS = 3000;

// Occupancy script: state + how many ticks it holds. Loops forever.
const OCCUPANCY_SCRIPT: Array<[string, number]> = [
  ['VACANT', 6],
  ['ENTRY_DETECTED', 2],
  ['OCCUPIED_ACTIVE', 12],
  ['OCCUPIED_IDLE', 6],
  ['OCCUPIED_SLEEPING', 8],
  ['EXIT_PENDING', 2],
  ['VACANT_CONFIRMED', 4],
];
const SCRIPT_TICKS = OCCUPANCY_SCRIPT.reduce((sum, [, ticks]) => sum + ticks, 0);

function occupancyAt(tick: number): string {
  let cursor = tick % SCRIPT_TICKS;
  for (const [state, ticks] of OCCUPANCY_SCRIPT) {
    if (cursor < ticks) return state;
    cursor -= ticks;
  }
  return 'VACANT';
}

function readEnvLocal(key: string): string | undefined {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return undefined;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && match[1] === key) return match[2];
  }
  return undefined;
}

function fail(message: string): never {
  console.error(`simulate-device: ${message}`);
  process.exit(1);
}

async function main() {
  const ticksArgIndex = process.argv.indexOf('--ticks');
  const maxTicks = ticksArgIndex >= 0 ? Number(process.argv[ticksArgIndex + 1]) : 0;

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ?? readEnvLocal('NEXT_PUBLIC_FIREBASE_DATABASE_URL');
  if (!databaseURL) fail('no database URL — set FIREBASE_DATABASE_URL or fill .env.local');
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    fail('GOOGLE_APPLICATION_CREDENTIALS is not set (service-account JSON, kept outside the repo)');
  }

  const app = initializeApp({
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS ? applicationDefault() : undefined,
    databaseURL,
    projectId:
      process.env.FIREBASE_PROJECT_ID ?? readEnvLocal('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
  });
  const latestRef = getDatabase(app).ref(
    `properties/${PROPERTY_ID}/rooms/${ROOM_ID}/latest`,
  );

  let tick = 0;
  let energyKWh = 0;

  console.log(
    `simulate-device: writing ${PROPERTY_ID}/${ROOM_ID}/latest every ${TICK_MS / 1000}s` +
      (maxTicks ? ` for ${maxTicks} ticks` : ' (Ctrl+C to stop — dashboard should go offline)'),
  );

  const timer = setInterval(async () => {
    const occupancyState = occupancyAt(tick);
    const occupied = !['VACANT', 'VACANT_CONFIRMED'].includes(occupancyState);
    const active = occupancyState === 'OCCUPIED_ACTIVE' || occupancyState === 'ENTRY_DETECTED';

    // Same shape as the firmware's dummy PZEM: sine-wave power, integrated energy.
    const voltage = 223 + 7 * Math.sin(tick / 9);
    const power = occupied ? 4.7 + 0.3 * Math.sin(tick / 5) : 0.6;
    energyKWh += (power * (TICK_MS / 1000)) / 3_600_000;

    await latestRef.update({
      voltage: Number(voltage.toFixed(1)),
      current: Number((power / voltage).toFixed(3)),
      power: Number(power.toFixed(2)),
      energy: Number(energyKWh.toFixed(5)),
      gas: 110 + Math.round(25 * Math.sin(tick / 7)),
      pir: active,
      doorOpen: occupancyState === 'ENTRY_DETECTED' || occupancyState === 'EXIT_PENDING',
      temperature: Number((27 + 1.5 * Math.sin(tick / 30)).toFixed(1)),
      humidity: Math.round(60 + 6 * Math.sin(tick / 25)),
      lightLevel: 0, // no sensor — contract honesty
      waterLevel: Math.max(20, 90 - Math.floor(tick / 40)),
      flowRate: 0,
      totalLiters: 0,
      relayStatus: occupied,
      buzzerStatus: false,
      occupancyState,
      humanPresent: occupied && occupancyState !== 'EXIT_PENDING',
      motionDetected: active,
      updatedAt: ServerValue.TIMESTAMP,
    });
    tick += 1;
    if (tick % 10 === 0 || (maxTicks && tick >= maxTicks)) {
      console.log(`simulate-device: tick ${tick} — ${occupancyState}, ${power.toFixed(2)} W`);
    }
    if (maxTicks && tick >= maxTicks) {
      clearInterval(timer);
      console.log('simulate-device: done');
      process.exit(0);
    }
  }, TICK_MS);
}

main().catch((error) => {
  console.error('simulate-device: failed —', error);
  process.exit(1);
});
