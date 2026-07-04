# 02 — Tick: offline + threshold alerts with lifecycle

Status: ready-for-agent
Slice: 2 of 7 · Parent: `.scratch/server-workloads/PRD.md`

## What to build

`/api/cron/tick` (1-min): `evaluateAlerts(deps, nowMs)` walks indexed rooms and maintains
`properties/{pid}/alerts` lifecycle records `{roomId, type, severity, value, startedAt,
resolvedAt, acknowledgedBy, acknowledgedAt}` for: `device-offline` (staleness > 90 s),
`gas` (> 300), `temperature` (> 33 °C default), `water-level` (< 20 % default). One open
alert per (room, type) — dedupe while open, auto-resolve when the condition clears
(offline resolves on fresh writes). Threshold defaults are constants until the Admin UI
phase makes them settings.

## Acceptance criteria

- [ ] Opens exactly one alert per (room, type); repeated ticks never duplicate.
- [ ] Auto-resolves with `resolvedAt` when the condition clears; reopens on recurrence as a NEW record.
- [ ] Offline alert respects the ~90 s semantics (server-corrected time; distinct from the 15 s UI mark).
- [ ] Emulator: full open → dedupe → resolve cycle proven for offline and gas.
- [ ] Secret-protected route; all gates green.

## Blocked by

- `01-energy-sampler.md` (shares cron auth, admin deps, room index).
