# 06 — Alert center UI with acknowledge

Status: ready-for-agent
Slice: 6 of 7 · Parent: `.scratch/server-workloads/PRD.md`

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
