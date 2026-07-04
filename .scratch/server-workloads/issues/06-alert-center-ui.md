# 06 — Alert center UI with acknowledge

Status: ready-for-human (implemented 2026-07-04 — rules re-publish covers the ack rules)
Slice: 6 of 7 · Parent: `.scratch/server-workloads/PRD.md`

> Implemented: `subscribeAlerts` + `acknowledgeAlert(uid)` on the port (adapter stamps
> serverTimestamp); AlertCenter on the dashboard under the active room — open alerts with
> type/severity chips (text labels, not color alone), value+unit per type, acknowledge
> button → "Acknowledged"; resolved history (last 10) below; all-quiet empty state.
> Rules: ONLY acknowledgedBy (must equal caller uid) + acknowledgedAt (number) are
> client-writable on alerts — emulator-proven incl. forgery and field-edit denials.
> 137 unit + 31 integration tests, all gates green.

## What to build

An Alerts panel (dashboard route/section): open alerts prominent (type, room, value,
started, live age), resolved history below; Owner can acknowledge an open alert
(`acknowledgedBy/At` — needs a narrow rules addition allowing owners to write exactly those
two fields on their property's alerts; risk gate #2, present diff). Live via subscription
through the RoomDataSource seam.

## Acceptance criteria

- [ ] Open alerts listed live; resolve/ack reflected without refresh.
- [ ] Acknowledge writes only the two fields; rules reject anything else (emulator negative test).
- [ ] Empty state when no alerts; severity visually encoded (form + color, not color alone).
- [ ] All gates green.

## Blocked by

- `02-tick-offline-threshold-alerts.md` (alert records exist).
