# scripts/ — dev tools (never part of demo or production)

## seed.ts — bootstrap accounts + tenancy records

Creates or updates a dashboard account with its role claim (ADR-0005), and for
owners links them to the bench node's `property_001`/`room_001` (the IDs the
firmware hardcodes until ADR-0007 provisioning lands):

```bash
# Against the real Firebase project:
#   1. Download a service-account key (Firebase console → Project settings →
#      Service accounts). Keep it OUTSIDE the repo. NEVER commit it (risk gate #5).
#   2. .env.local must contain NEXT_PUBLIC_FIREBASE_DATABASE_URL (or export FIREBASE_DATABASE_URL).
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  node scripts/seed.ts --email owner@example.com --password "a-strong-password" --role owner

# First admin (bootstraps the Admin role — no tenancy records written):
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  node scripts/seed.ts --email admin@example.com --password "a-strong-password" --role admin

# Against local emulators instead (no service account needed):
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 \
FIREBASE_PROJECT_ID=demo-ecostay \
FIREBASE_DATABASE_URL=http://127.0.0.1:9000/?ns=demo-ecostay \
  node scripts/seed.ts --email owner@ecostay.test --password "owner-pass-1" --role owner
```

Optional: `--property-name "..."` / `--room-name "..."` (only set when the name
is absent, so Admin-UI renames are never clobbered).

Runs directly under Node ≥ 23 (native type stripping) — no build step.

## simulate-device.ts — fake firmware writes for UI development

Writes contract-exact `latest` snapshots for `property_001/room_001` every 3 s (sine-wave
PZEM values, scripted occupancy cycle, server timestamps) so the dashboard shows live,
moving data without the ESP32. **Dev/rehearsal only — never the demo** (the evaluation runs
on the real prototype). Stop it with Ctrl+C to exercise the offline behavior.

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  node scripts/simulate-device.ts            # runs until Ctrl+C
# or a bounded run:  node scripts/simulate-device.ts --ticks 20
```

## validate-savings.ts — §10.2 pre/post energy report (capstone)

Prints the baseline-vs-EcoStay comparison and the ≥20% success indicator for the thesis.
The reduction is modelled from **measured occupancy + rated circuit wattage** (it does not
need the power meter; the meter later upgrades rated → measured). The same figures render
live in the dashboard's Activity tab (`SavingsValidation`); the kWh/reduction math mirrors
the tested `src/tariff/validation.ts`.

```bash
# Real recorded occupancy (reads dailyAggregates + circuitWattages from RTDB):
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
  node scripts/validate-savings.ts --property property_001 --room room_001

# Reproducible scenario (no Firebase needed); --rate is a flat LKR/kWh estimate:
node scripts/validate-savings.ts --window-hours 24 --occupied-hours 10.5 \
  --lights 60 --fan 45 --rate 45
```

