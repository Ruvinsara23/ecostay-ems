# 01 — Admin settings: edit tariff category + circuit wattages

Status: ready-for-human (implemented 2026-07-07 — rules re-publish required)
Slice: 1 of 4 · Parent: `.scratch/admin-console/PRD.md`

> Implemented (TDD): `RequireAdmin` guard (owner→/, signed-out→login), `/admin` route +
> `AdminSettings` form (tariff select + wattage inputs, live-subscribed, saves via port),
> port `setTariffCategory`/`subscribeCircuitWattages`/`setCircuitWattages`, rail Settings →
> /admin for admins. Rules add admin-only, validated writes to `settings/tariffCategory`
> (∈ D-1/GP-1/H-1) and `settings/circuitWattages` (numeric). 175 unit + 33 emulator tests
> (admin allowed / owner denied / invalid rejected), verified rendered.
> **Human: re-publish database.rules.json in the console** before admins can save on prod.

## What to build

An **admin-only** settings screen where an admin edits, per property, the CEB **tariff category**
(D-1 / GP-1 / H-1) and the **circuit wattages** (lights, exhaustFan) that drive cost + savings.

- Route `/admin` (or an admin section) guarded so **only `role === 'admin'`** reaches it; owners
  are redirected to `/`. The rail Settings icon navigates admins here.
- Form: tariff category select (current value pre-filled), two wattage number inputs; Save writes
  through the port; success/failure feedback; values reflect the live subscribed state.
- Port: `setTariffCategory(pid, category)`, `subscribeCircuitWattages(pid, cb)`,
  `setCircuitWattages(pid, {lights, exhaustFan})`; real Firebase adapter + fake.
- Rules (risk gate #2 — present diff, human publishes): admin-role write to
  `settings/tariffCategory` (validate ∈ D-1/GP-1/H-1) and `settings/circuitWattages` (numeric
  lights + exhaustFan). Owners denied.

## Acceptance criteria

- [ ] An owner navigating to the admin route is redirected; an admin sees the settings form.
- [ ] The form shows current tariff category + wattages and saves changes through the port.
- [ ] Changing the tariff/wattages updates the dashboard cost/savings (same subscription).
- [ ] Emulator: admin write to the two settings fields succeeds; owner write is denied; a
      non-D-1/GP-1/H-1 category and a non-numeric wattage are rejected by `.validate`.
- [ ] UI imports the port only; `npm test`, typecheck, lint, build green.

## Blocked by

None — Admin role + tenancy already exist.
