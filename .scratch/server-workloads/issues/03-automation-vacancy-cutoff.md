# 03 — Automation: vacancy cutoff with epoch precedence

Status: ready-for-human (implemented 2026-07-04 — rules re-publish needed for the toggle)
Slice: 3 of 7 · Parent: `.scratch/server-workloads/PRD.md`

> Implemented: `runAutomation` (transition-only, toggle-gated, stale-data never advances the
> state machine, no phantom first-observation transition); cutoff writes lights+exhaustFan
> only + `automationLog`; owner toggle in the Controls card (usable offline — it's a server
> setting); rules diff adds owner-writable boolean `settings/automationEnabled` (emulator-
> validated incl. non-boolean rejection). **Human: re-publish database.rules.json in the
> console.** Epoch precedence emulator-proven: manual re-on survives the next tick.

## What to build

Inside the same tick: `runAutomation(deps, nowMs)` compares each room's `occupancyState` to
the last-seen state in `ops/`, and on a transition INTO `VACANT_CONFIRMED` with
`properties/{pid}/rooms/{rid}/settings/automationEnabled === true` writes `lights=false` and
`exhaustFan=false` and appends `properties/{pid}/automationLog` `{roomId, action, relays,
fromState, toState, at}`. Acting only on observed transitions IS the grilled epoch
precedence (manual commands after the transition stand). Never `mainRelay`. Owner UI gets
the automation toggle on the room view (rules addition: owner-writable `settings/automationEnabled`
— risk gate #2, present the diff for approval).

## Acceptance criteria

- [ ] Cutoff fires exactly once per transition into VACANT_CONFIRMED; later ticks in the same vacancy do nothing (manual override survives).
- [ ] Disabled toggle → no writes, no log; missing toggle defaults OFF.
- [ ] `automationLog` entry per action with the full record.
- [ ] Rules diff for `settings/automationEnabled` approved by human before publish.
- [ ] Emulator: transition → commands written + logged; manual re-on then next tick → untouched.
- [ ] All gates green.

## Blocked by

- `02-tick-offline-threshold-alerts.md` (same tick pipeline).
