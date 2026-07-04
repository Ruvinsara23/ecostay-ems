# ADR-0009: Migrate to the fresh `ecostay-ems` Firebase project

Date: 2026-07-04 · Status: Accepted (amends the project-identity clause of ADR-0003)

## Context
ADR-0003 kept the previous build's Firebase project (`esp32led-b6105-c0b99`) because reflashing
firmware mid-capstone was judged high-risk. Two things changed since: ADR-0007 approved a firmware
workstream that reflashes the device anyway (provisioning, per-device credentials, real PZEM), and
the new PCB requires reflashing regardless. Meanwhile the old project is a standing liability:

- Its web config (API key + DB URL) was committed to the old public repo (ADR-0001) — combined
  with anonymous auth, strangers can write to that database.
- The firmware creates a new anonymous user on every boot — months of junk identities.
- Legacy data, default rules, and a meaningless project ID predate this rebuild.
- Email/Password sign-in was never enabled there (discovered during the slice-01 live pass:
  `PASSWORD_LOGIN_DISABLED`).

The system currently has near-zero investment in the old project (two seeded accounts, re-runnable
in seconds). After slice 02, Blaze billing, Cloud Functions, and rules land, this migration costs
an order of magnitude more.

## Decision
Move the entire system to the fresh **`ecostay-ems`** Firebase project now:

- RTDB instance in **asia-southeast1**; Auth providers **Email/Password** (humans) and
  **Anonymous** (device, until ADR-0007 per-device credentials cut over).
- The **firmware contract is unchanged** — same paths, field names, types, cadence,
  `property_001`/`room_001`. Only the firmware's two config constants (`API_KEY`,
  `DATABASE_URL`) change, applied by a human reflash as the first step of the ADR-0007
  workstream. No contract shapes move.
- Transitional RTDB ruleset (`database.rules.json`, kept in-repo as the canonical copy) applies
  from day one: anonymous may write only the bench room's telemetry paths and read only its
  command paths; humans are gated by role claims and membership. Deleted at the ADR-0007
  credential cutover per CONTEXT.md.
- `.env.local` retargets the dashboard; the seeder re-runs against the new project.
- The old project is left read-only-in-practice (no longer referenced anywhere) and can be
  deleted once the reflash is verified.

## Consequences
- Clean auth population (no boot-spawned anonymous junk), rules written from scratch for our
  model, Blaze billing (ADR-0006) attaches to a properly named project the team owns.
- The leaked-config exposure of the old project stops mattering: nothing points there anymore.
- Until the human reflashes the device, the ESP32 still writes to the old project — live
  telemetry resumes (in the new project) only after the reflash is verified. Slice 02 depends
  on it.
- `docs/firmware-contract.md` gains a project-identity note; ADR-0003's contract-immutability
  rule continues to apply to shapes/paths/cadence, now on the new project.
