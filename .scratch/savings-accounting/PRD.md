# PRD — Savings accounting model (OBJ-07 correction)

Status: accepted 2026-07-30 (owner approved the proposal in session).
Supersedes the `avoidedKWh` rule in `src/server/rollup.ts`.

## Problem

Three defects in the shipped savings figure, in order of severity.

**1. The credit is unbounded and purely counterfactual.**
`rollup.ts` credits every 5-minute sample whose `occupancyState === 'VACANT_CONFIRMED'`,
with no upper bound and no evidence that the circuit was ever running. A checked-out
room sits in `VACANT_CONFIRMED` indefinitely and accrues "avoided" energy forever.
At today's lights+fan wattage that is ~1.4 kWh/day — small enough to go unnoticed.

**2. The air conditioner is structurally excluded.**
`CircuitWattages = { lights, exhaustFan }`, and `database.rules.json` actively
rejects a third key (`hasChildren(['lights','exhaustFan'])` + `"$other": false`).
ADR-0013 made the AC a controlled circuit and cutoff/restore write all three.
With a 1,000 W AC against tens of watts of lights/fan, the figure omits ~90%+ of
its true magnitude.

**Defects 1 and 2 interact.** Fixing 2 alone multiplies the unbounded loop by ~20×:
an empty room would claim ~24 kWh/day, ~720 kWh/month — likely exceeding the
property's real consumption. **They must not ship in that order.**

**3. The audit evidence is collected and never read.**
`sample-energy.ts` records `SampleRelays` per sample with the docblock intent
"so a savings claim is AUDITABLE (were the appliances actually off while the room
was confirmed-vacant?)". `rollup.ts` never reads `sample.relays`.

## Decision — evidence-armed, bounded credit

Replace the counterfactual with recorded evidence. Per circuit, walking a room's
samples in time order:

- **Armed** — the circuit was commanded ON during a sample where the occupancy
  policy ALLOWED it to run (i.e. it was actually energised, not merely requested).
- **Credit** — the room is in a credited state where the policy BLOCKS that
  circuit (so it is physically off), and the circuit is armed → credit
  `wattage × interval`.
- **Disarm** — the guest returns, or the device reboots to `VACANT`.
- **Cap** — at most `MAX_CREDIT_MS_PER_VACANCY` of any single continuous vacancy.

Physical off-ness is derived from `comfortLoadCommandAllowed()`
(`src/telemetry/occupancy-policy.ts`), NOT from the command boolean. ADR-0014
retains commands during `EXIT_PENDING`, so the command still reads `true` there
while the firmware holds the relay off. The occupancy policy is the authority on
whether a load is energised; reusing it keeps one source of truth.

### Why this is defensible

The claim stops being "we assume it would have been on" and becomes a chain where
every clause is backed by a stored sample: the circuit was recorded ON while the
policy allowed it → the room was then recorded in a state where the policy blocks
it → we credit rated wattage for that bounded interval.

The empty-room problem disappears by construction: a room nobody occupied has no
armed circuit and earns nothing regardless of how long it sits vacant.

### Credited / arming states

| State | Arms | Credits | Note |
|---|---|---|---|
| `OCCUPIED_ACTIVE` | yes | no | policy allows all three |
| `OCCUPIED_IDLE` | yes | no | policy allows all three |
| `OCCUPIED_SLEEPING` | AC only | no | ADR-0014: AC allowed, lights/fan blocked but guest present — excluded from credit by decision |
| `ENTRY_DETECTED` | no | no | ends a vacancy (guest arriving); loads cut but nothing to credit |
| `EXIT_PENDING` | no | yes | loads physically cut, guest leaving |
| `VACANT_CONFIRMED` | no | yes | loads physically cut and commands cleared |
| `VACANT` | no | no | boot/reset state — clears armed (continuity lost) |

### Conservative defaults

- Missing `relays` data → cannot arm → no credit. **AC savings only begin
  accruing after the sampler change deploys.** No backfill.
- Interval is the ACTUAL delta between consecutive samples, clamped to the
  nominal 5 min. Cron double-fires cannot over-credit; missed cycles under-credit.
- `relays` records the COMMAND, not a relay acknowledgement — the firmware
  provides no ack. Pre-existing, documented limitation.
- Rated wattage, not measured draw. A nameplate AC cycles its compressor and
  averages below nameplate; a duty-cycle factor is deliberately NOT baked in —
  raised in the ADR as a known overstatement instead.

### Day boundary

The rollup is per-day but a vacancy can span midnight. `rollupDaily` reads an
extended window (`startMs - LOOKBACK_MS`) to establish arm state from the
previous day, and credits only samples at/after `startMs`. `kWhUsed` and
`occupiedMinutes` keep using in-day samples only — unchanged behaviour.

## Slices

- **01 — credit model** (`src/server/avoided-energy.ts`, pure + tests) and its
  wiring into `rollup.ts`. Lights + fan only. No rules, no AC, no type change.
  The number moves modestly and can be eyeballed before the AC scales it.
- **02 — AC as a third controlled circuit**: `CircuitWattages` gains
  `airConditioner`; sampler captures it in `SampleRelays`; admin settings gains a
  third input; `admin-deps` tolerates a stored value without it;
  `savings-validation` sums all three. **RISK GATE #2** — `database.rules.json`
  validation changes and must be re-published.
- **03 — UI honesty**: `energy-charts.tsx` renders an explicit zero-state instead
  of `{saved > 0 && …}` hiding the block entirely; copy states the model.
- **04 — docs**: new ADR, CONTEXT.md `Savings` derived term, HANDOFF.

## Gates

- **#8 money-facing** — the rendered figure is eyeballed before it counts
  (the LKR 3,415 pricing bug only showed on render).
- **#2 RTDB rules** — slice 02 only; needs a human re-publish after the
  2026-07-30 publish.

## Out of scope

- Crediting `OCCUPIED_SLEEPING` (ADR-0014 excluded it; guest present; AC stays on
  by design so there is little to claim).
- The A/B Evaluation runner — retired from thesis claims; its baseline arm is
  unproducible with the current firmware gate.
- Measured (PZEM) wattage. Everything here stays labelled modelled.
