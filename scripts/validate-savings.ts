// §10.2 validation report (capstone) — prints the pre/post baseline-vs-EcoStay
// energy comparison and the ≥20% success indicator for the thesis.
//
// The kWh/reduction math mirrors src/tariff/validation.ts (the tested source of
// truth the dashboard uses); it is inlined here only because that module's
// import chain uses the `@/` alias, which plain `node` cannot resolve.
//
// Real recorded occupancy (recommended):
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
//     node scripts/validate-savings.ts --property property_001 --room room_001
// Reproducible scenario (no Firebase needed):
//   node scripts/validate-savings.ts --window-hours 24 --occupied-hours 10.5 \
//     --lights 60 --fan 45 --rate 45
//
// Optional: --rate <LKR/kWh> for a flat cost estimate, --target <pct> (default 20).

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type Args = Map<string, string>;

function parseArgs(argv: string[]): Args {
  const values: Args = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (!flag?.startsWith('--') || value === undefined) {
      console.error(`validate-savings: malformed arguments near "${flag ?? ''}"`);
      process.exit(1);
    }
    values.set(flag.slice(2), value);
  }
  return values;
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

const round = (value: number, dp = 3): number => Number(value.toFixed(dp));

/** Mirrors computeValidation() in src/tariff/validation.ts (energy side). */
function validate(windowHours: number, occupiedHours: number, watts: number, targetPct: number) {
  const occ = Math.min(Math.max(0, occupiedHours), windowHours);
  const vacantHours = round(windowHours - occ, 2);
  const baselineKWh = round((watts * windowHours) / 1000);
  const automatedKWh = round((watts * occ) / 1000);
  const avoidedKWh = round(baselineKWh - automatedKWh);
  const totalReductionPct = baselineKWh > 0 ? round((avoidedKWh / baselineKWh) * 100, 1) : 0;
  return {
    windowHours: round(windowHours, 2),
    occupiedHours: round(occ, 2),
    vacantHours,
    watts,
    baselineKWh,
    automatedKWh,
    avoidedKWh,
    totalReductionPct,
    passed: totalReductionPct >= targetPct,
  };
}

async function readRealData(
  propertyId: string,
  roomId: string,
): Promise<{ occupiedMinutes: number; days: number; watts: number }> {
  const { applicationDefault, initializeApp } = await import('firebase-admin/app');
  const { getDatabase } = await import('firebase-admin/database');

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ?? readEnvLocal('NEXT_PUBLIC_FIREBASE_DATABASE_URL');
  if (!databaseURL) {
    console.error('validate-savings: no database URL (FIREBASE_DATABASE_URL / .env.local).');
    process.exit(1);
  }
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error('validate-savings: set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON.');
    process.exit(1);
  }

  const app = initializeApp({ credential: applicationDefault(), databaseURL });
  const db = getDatabase(app);

  const aggregates = (
    await db.ref(`properties/${propertyId}/dailyAggregates/${roomId}`).get()
  ).val() as Record<string, { occupiedMinutes?: number }> | null;
  const wattages = (
    await db.ref(`properties/${propertyId}/settings/circuitWattages`).get()
  ).val() as { lights?: number; exhaustFan?: number } | null;

  const dates = Object.keys(aggregates ?? {});
  const occupiedMinutes = dates.reduce((s, d) => s + (aggregates?.[d]?.occupiedMinutes ?? 0), 0);
  const watts = (wattages?.lights ?? 0) + (wattages?.exhaustFan ?? 0);
  return { occupiedMinutes, days: dates.length, watts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetPct = args.has('target') ? Number(args.get('target')) : 20;
  const rate = args.has('rate') ? Number(args.get('rate')) : null;

  let windowHours: number;
  let occupiedHours: number;
  let watts: number;
  let source: string;

  const property = args.get('property');
  const room = args.get('room');
  if (property && room) {
    const real = await readRealData(property, room);
    if (real.days === 0) {
      console.error(
        `validate-savings: no daily aggregates for ${property}/${room} yet ` +
          '(they are written by the nightly rollup once the room has recorded occupancy).',
      );
      process.exit(1);
    }
    if (real.watts === 0) {
      console.error(
        `validate-savings: no circuit wattages set for ${property} — set them in Admin first.`,
      );
      process.exit(1);
    }
    windowHours = real.days * 24;
    occupiedHours = real.occupiedMinutes / 60;
    watts = real.watts;
    source = `real recorded occupancy — ${property}/${room}, ${real.days} day(s)`;
  } else {
    windowHours = Number(args.get('window-hours') ?? 24);
    occupiedHours = Number(args.get('occupied-hours') ?? NaN);
    watts = (Number(args.get('lights') ?? 0) || 0) + (Number(args.get('fan') ?? 0) || 0);
    if (Number.isNaN(occupiedHours) || watts === 0) {
      console.error(
        'validate-savings: provide --property/--room for real data, OR --occupied-hours and ' +
          '--lights/--fan for a scenario.',
      );
      process.exit(1);
    }
    source = 'scenario (command-line arguments)';
  }

  const r = validate(windowHours, occupiedHours, watts, targetPct);
  const savedLKR = rate !== null ? round(r.avoidedKWh * rate, 2) : null;
  const pad = (s: string, n: number) => s.padStart(n);

  console.log('');
  console.log('  ENERGY SAVINGS VALIDATION  (Proposal §10.2)');
  console.log(`  Source: ${source}`);
  console.log(`  Controlled circuits: ${r.watts} W   Window: ${r.windowHours} h ` +
    `(occupied ${r.occupiedHours} h, vacant ${r.vacantHours} h)`);
  console.log('  ' + '-'.repeat(46));
  console.log(`  ${'Metric'.padEnd(22)}${pad('Baseline', 11)}${pad('EcoStay', 11)}`);
  console.log('  ' + '-'.repeat(46));
  console.log(`  ${'Energy (kWh)'.padEnd(22)}${pad(String(r.baselineKWh), 11)}${pad(String(r.automatedKWh), 11)}`);
  console.log(`  ${'Unoccupied waste (kWh)'.padEnd(22)}${pad(String(r.avoidedKWh), 11)}${pad('~0', 11)}`);
  if (savedLKR !== null) {
    console.log(`  ${'Cost avoided (LKR)'.padEnd(22)}${pad('-', 11)}${pad(String(savedLKR), 11)}`);
  }
  console.log('  ' + '-'.repeat(46));
  console.log(`  Energy reduction: ${r.totalReductionPct}%   (target ${targetPct}%)`);
  console.log(`  RESULT: ${r.passed ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log('');
  process.exit(0);
}

main().catch((error) => {
  console.error('validate-savings: failed —', error);
  process.exit(1);
});
