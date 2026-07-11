# 10 — Fleet Alerts + Devices nav (scope-backed rail growth)

**Why:** the operator asked for a fuller admin rail. Growing it must stay scope-backed
(use-cases.md), not filler. Two capabilities exist but are buried inside per-property
detail pages:

- **Alerts** — acting on safety alerts (admin use case 6 / owner use case 7) requires
  opening each property. A fleet `/admin/alerts` page composes the existing per-property
  `AlertCenter` (same subscribe + acknowledge path approved in slice 08 — no new writes).
- **Devices** — device provisioning (admin use case 5) lives per property; there is no
  registry answering "which rooms have device accounts, when did each last report?"
  `/admin/devices` is a READ-ONLY fleet table built from the existing `listProperties` +
  `listRooms` port methods (no new API). Create/reset stays in property detail — one
  write path for credentials.

**Rail after:** Overview · Alerts · Properties · Devices · Owners (+ Sign out).

**Explicitly NOT added:** a "Settings" rail entry (settings are per-property, in detail —
a global entry would be a dead end); "System/cron health" (needs cron runs to stamp
`ops/cronRuns` first — candidate for a later slice).

**Risk gates:** none — no new writes, no rules, no auth semantics.
