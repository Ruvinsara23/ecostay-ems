# 09 — Fleet Overview (the console's missing oversight pillar)

**Why (scope):** CONTEXT.md defines Admin as *"everything Owner can do, plus operator tasks —
sees all properties."* The console covers all five operator use cases (register, owners,
tenancy, settings, device provisioning) but surfaces **zero fleet-level oversight**: an
operator cannot answer "are all devices reporting? is anything alarming?" without opening
every property one by one. The server already maintains exactly this data (`ops/roomIndex`,
`latest/updatedAt`, `ops/openAlerts`). docs/use-cases.md now records this as Admin use case 6.

**Slice (tracer bullet through all layers):**

- `src/server/admin-directory.ts` — `fleetStatus(db, now)`: per property
  `{propertyId, name, roomCount, roomsReporting, openAlerts[{roomId, type}]}`.
  "Reporting" = `deviceFreshness(updatedAt, now).online` — the SAME 15 s convention the
  owner dashboard shows (one truth, `src/telemetry/device-freshness.ts`). Open alerts come
  straight from the `ops/openAlerts` index the tick workload maintains (no alert-log scan).
- `GET /api/admin/properties?view=status` — same route, admin-token guarded, `Date.now()`.
- `AdminOperations.fleetStatus()` + HTTP adapter + fake.
- `src/admin/admin-overview.tsx` — new landing view: three stat tiles
  (properties / rooms reporting / open alerts) + per-property rows with a reporting badge,
  open-alert chips (`room · type`, gas = danger), click-through to property detail.

**Routing (IA):** `/admin` = Overview (operator lands on "is everything OK").
Properties list + register form moves to `/admin/properties` (detail stays at
`/admin/properties/[pid]`; back link updated). Rail: Overview · Properties · Owners.

**Explicitly NOT in this slice:** fleet-wide energy/cost aggregation (owner-side monthly
figures are per property already; aggregate money needs gate #8 eyes), cron-run health
(belongs to runbook/ops, revisit if crons ever misbehave silently), auto-refresh/polling
(snapshot + manual refresh is enough at this scale).

**Risk gates:** none touched — read-only Admin SDK reads behind the existing admin-token
check; no rules, no auth semantics, no device commands, no money math.
