// §10.2 validation report (capstone) — prints the pre/post baseline-vs-EcoStay
// energy comparison and the ≥20% success indicator for the thesis.
//
// The kWh/reduction math mirrors src/tariff/validation.ts (the tested source of
// truth the dashboard uses); it is inlined here only because that module's
// import chain uses the `@/` alias, which plain `node` cannot resolve.
//
// Real recorded occupancy AND recorded cutoff credit (recommended — this is the
// figure the dashboard shows; the two cannot disagree):
//   GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json \
//     node scripts/validate-savings.ts --property property_001 --room room_001
// Reproducible scenario (no Firebase needed). --credited-hours is the vacancy
// actually cut, NOT all vacant time — there is no default, state it explicitly:
//   node scripts/validate-savings.ts --window-hours 24 --occupied-hours 10.5 \
//     --credited-hours 4 --lights 60 --fan 45 --ac 1000 --rate 45
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

/**
 * Mirrors computeValidation() in src/tariff/validation.ts (energy side).
 *
 * `avoidedKWh` is the RECORDED credit from the nightly rollup, not a figure
 * re-derived from vacant hours. Deriving it assumed the controlled circuits
 * would have run every vacant hour, which let a room nobody occupied claim
 * savings it never made.
 */
function validate(
  windowHours: number,
  occupiedHours: number,
  watts: number,
  avoidedKWhInput: number,
  targetPct: number,
) {
  const occ = Math.min(Math.max(0, occupiedHours), windowHours);
  const vacantHours = round(windowHours - occ, 2);
  const avoidedKWh = round(Math.max(0, avoidedKWhInput));
  const occupiedRuntimeKWh = round((watts * occ) / 1000);
  const baselineKWh = round(occupiedRuntimeKWh + avoidedKWh);
  const creditedVacantHours = watts > 0 ? round((avoidedKWh * 1000) / watts, 2) : 0;
  const totalReductionPct = baselineKWh > 0 ? round((avoidedKWh / baselineKWh) * 100, 1) : 0;
  return {
    windowHours: round(windowHours, 2),
    occupiedHours: round(occ, 2),
    vacantHours,
    watts,
    baselineKWh,
    occupiedRuntimeKWh,
    avoidedKWh,
    creditedVacantHours,
    totalReductionPct,
    passed: totalReductionPct >= targetPct,
  };
}

async function readRealData(
  propertyId: string,
  roomId: string,
): Promise<{ occupiedMinutes: number; avoidedKWh: number; days: number; watts: number }> {
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
  ).val() as Record<string, { occupiedMinutes?: number; avoidedKWh?: number }> | null;
  const wattages = (
    await db.ref(`properties/${propertyId}/settings/circuitWattages`).get()
  ).val() as { lights?: number; exhaustFan?: number; airConditioner?: number } | null;

  const dates = Object.keys(aggregates ?? {});
  const occupiedMinutes = dates.reduce((s, d) => s + (aggregates?.[d]?.occupiedMinutes ?? 0), 0);
  // The credit the rollup actually recorded — never re-derived here.
  const avoidedKWh = dates.reduce((s, d) => s + (aggregates?.[d]?.avoidedKWh ?? 0), 0);
  const watts =
    (wattages?.lights ?? 0) + (wattages?.exhaustFan ?? 0) + (wattages?.airConditioner ?? 0);
  return { occupiedMinutes, avoidedKWh, days: dates.length, watts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetPct = args.has('target') ? Number(args.get('target')) : 20;
  const rate = args.has('rate') ? Number(args.get('rate')) : null;

  let windowHours: number;
  let occupiedHours: number;
  let watts: number;
  let avoidedKWh: number;
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
    avoidedKWh = real.avoidedKWh;
    source = `real recorded occupancy + recorded cutoff credit — ${property}/${room}, ${real.days} day(s)`;
  } else {
    windowHours = Number(args.get('window-hours') ?? 24);
    occupiedHours = Number(args.get('occupied-hours') ?? NaN);
    watts =
      (Number(args.get('lights') ?? 0) || 0) +
      (Number(args.get('fan') ?? 0) || 0) +
      (Number(args.get('ac') ?? 0) || 0);
    // A scenario has no recorded credit, so it must be stated. Defaulting it to
    // "every vacant hour" is the overstatement this model exists to remove.
    const creditedHours = Number(args.get('credited-hours') ?? NaN);
    if (Number.isNaN(occupiedHours) || watts === 0 || Number.isNaN(creditedHours)) {
      console.error(
        'validate-savings: provide --property/--room for real data, OR --occupied-hours, ' +
          '--credited-hours and --lights/--fan/--ac for a scenario.\n' +
          '  --credited-hours is the vacancy actually cut (bounded), NOT all vacant time.',
      );
      process.exit(1);
    }
    avoidedKWh = (watts * Math.max(0, creditedHours)) / 1000;
    source = 'scenario (command-line arguments)';
  }

  const r = validate(windowHours, occupiedHours, watts, avoidedKWh, targetPct);
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
  console.log(`  ${'Energy (kWh)'.padEnd(22)}${pad(String(r.baselineKWh), 11)}${pad(String(r.occupiedRuntimeKWh), 11)}`);
  console.log(`  ${'Cut during vacancy'.padEnd(22)}${pad(String(r.avoidedKWh), 11)}${pad('0', 11)}`);
  console.log(`  ${'Credited vacancy (h)'.padEnd(22)}${pad(String(r.creditedVacantHours), 11)}${pad('-', 11)}`);
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
