# 03 — Automation: vacancy cutoff with epoch precedence

Status: ready-for-agent
Slice: 3 of 7 · Parent: `.scratch/server-workloads/PRD.md`

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
