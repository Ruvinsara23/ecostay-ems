# ADR-0015: Credit savings from recorded evidence, bounded per vacancy

Date: 2026-07-30 · Status: Accepted · Amends: the OBJ-07 savings rule (ADR-0008 pricing unchanged)

## Context

The shipped savings figure credited every 5-minute sample whose `occupancyState`
was `VACANT_CONFIRMED`, multiplied by the summed wattage of `lights` +
`exhaustFan`. Three defects followed.

**The credit was unbounded and purely counterfactual.** Nothing established that
a circuit had ever been running, and nothing bounded how long a vacancy could
accrue. A checked-out room sits in `VACANT_CONFIRMED` indefinitely and minted
avoided energy forever. At lights+fan wattage that was ~1.4 kWh/day — small
enough to go unnoticed.

**The air conditioner was structurally excluded.** `CircuitWattages` was
`{ lights, exhaustFan }` and `database.rules.json` rejected a third key
(`"$other": { ".validate": false }`), even though ADR-0013 made the AC a
controlled circuit that cutoff and restore both write. With a 1,000 W AC the
figure omitted the great majority of its own subject.

These two interact: adding the AC to the unbounded loop would have had an empty
room claim ~24 kWh/day, ~720 kWh/month — likely more than the property consumes.

**The audit evidence was collected and never read.** `sample-energy.ts` records
`SampleRelays` on every sample, its docblock stating the purpose is auditability
("were the appliances actually off while the room was confirmed-vacant?").
`rollup.ts` never read the field.

## Decision

Savings credit is derived from recorded evidence rather than assumption.
Per circuit, walking a room's samples in time order:

- **Armed** — a sample shows the circuit commanded on while the occupancy policy
  ALLOWED it to run, i.e. it was actually energised.
- **Credited** — the room is in a credited state where that same policy BLOCKS
  the circuit, and the circuit is armed → credit `wattage × interval`.
- **Disarmed** — the guest returns, or the device reboots to `VACANT`.
- **Capped** — at most `MAX_CREDIT_MS_PER_VACANCY` (4 h) of any one continuous
  vacancy.

Physical off-ness comes from `comfortLoadCommandAllowed()`, NOT from the command
boolean. ADR-0014 retains commands through `EXIT_PENDING` while the firmware
holds the relay off, so the command still reads `true` there. The occupancy
policy is the single authority on whether a load is energised.

Credited states are `EXIT_PENDING` and `VACANT_CONFIRMED`. `OCCUPIED_SLEEPING`
is excluded: the guest is present, and ADR-0014 keeps the AC running there.

- `airConditioner` joins `CircuitWattages` as an OPTIONAL key, so a property
  configured before ADR-0013 still reads back and simply claims nothing for the
  AC until an admin sets a wattage.
- The interval credited is the ACTUAL gap between consecutive samples, clamped
  to the nominal 5 minutes. Cron double-fires cannot over-credit; missed cycles
  under-credit.
- Missing `relays` data cannot arm a circuit. Savings therefore begin accruing
  only after the sampler change deploys; nothing is backfilled.
- The nightly rollup reads 4 h 5 min before the day boundary so a vacancy that
  began the previous evening can still be armed. Those extra samples arm only —
  they are never aggregated or credited.
- `computeValidation()` (the §10.2 card, and `scripts/validate-savings.ts`)
  consumes the RECORDED `avoidedKWh` instead of re-deriving it from vacant
  hours. Its baseline is `occupied-runtime + credited`, and its reduction is
  `credited / baseline`.
- Pricing is unchanged: the gate-#8 marginal-rate `savedLKR` engine (ADR-0008).

## Consequences

- A room nobody occupied earns nothing however long it sits vacant. This is
  guaranteed by construction, not by a threshold.
- A circuit the guest switched off themselves earns nothing — there was no
  avoided energy to claim.
- **The headline percentage falls.** On a representative 10-day window the §10.2
  card moved from 37.5% to 21.1%. The old figure was produced even when zero
  cutoffs had been recorded; the new one is not.
- The owner's "Saved this month" and the §10.2 card now share one recorded
  quantity and one pricing engine. Before this they could disagree by ~90×
  (LKR 20.40 against Rs 1836 on the same screen).
- The claim's form changes from "we assume it would have been on" to a chain
  where each clause is backed by a stored sample: recorded running while
  allowed → recorded in a state that blocks it → credited for a bounded
  interval.
- **`database.rules.json` must be published before the app deploys.** The live
  ruleset rejects an `airConditioner` key, so the admin Settings form — which
  now sends it — would have its entire save refused. App-before-rules breaks
  admin settings.
- The 4 h cap is a judgement, not a derivation. It is the one number here an
  examiner can reasonably contest; it is stated in the UI and adjustable.
- Still MODELLED, not measured. Rated nameplate wattage, and `relays` carries
  the COMMAND, not a relay acknowledgement (the firmware has no ack). A
  nameplate AC cycles its compressor and averages below nameplate, so the
  estimate errs high — a duty-cycle factor was deliberately NOT baked in rather
  than introducing an unsourced constant.

## Alternatives rejected

- **Add the AC without bounding the credit** — produces a fabricated
  ~720 kWh/month for an empty room. The two changes had to land together.
- **A time cap alone, without arming** — bounds the absurdity but still credits
  circuits that were never running.
- **Crediting `OCCUPIED_SLEEPING`** — the guest is present, and ADR-0014 keeps
  the AC on through sleep, so there is little to claim and the counterfactual is
  weak.
- **Backfilling historic samples** — pre-change samples lack the relay evidence;
  inventing it would defeat the point of the model.
