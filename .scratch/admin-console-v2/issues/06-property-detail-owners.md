# 06 - Property detail: Owners

Status: read side done (2026-07-11); assign/remove member WRITES still awaiting risk-gate #1 approval
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

Answer "who owns / has access to property X" and manage it: read the members record
back, assign an existing owner, remove access. (Fills AUDIT C: `properties/{pid}/members`
is written but never read back; no add/remove owner assignment exists.)

## Scope

- **Read**: property -> owners for the detail page — read `properties/{pid}/members`
  back via `AdminOperations` over a `GET` route behind `authorizeAdmin`, joined with
  owner email/disabled as in `listOwners`.
- **Writes** (Admin SDK, admin-only route):
  - Assign an EXISTING owner to this property (no owner creation here — that stays in
    the global Owners view).
  - Remove an owner's access to this property.
  - Both keep the two records consistent: `properties/{pid}/members/{uid}` (authority)
    and the `users/{uid}/properties/{pid}` index.
- Remove-access goes through `ConfirmDialog` (AUDIT B: destructive actions fire with
  no confirmation).
- Owners section on `/admin/properties/[pid]`, built from `src/ui/` primitives, with
  loading / empty / error states and post-mutation refresh.

## Risk gates

- **#1 Auth/roles** — members writes through the Admin SDK mutate the tenancy authority
  record. Admin claim verified on every read and write.
- No client rules changes expected (admins already read `properties/*`; writes go
  through the Admin SDK).

## Test plan

- Unit tests: assign/remove update both `members` and the `users` index consistently;
  validation (unknown owner, unknown property, already-assigned, not-a-member).
- Route tests: admin succeeds; owner / unauthenticated denied.
- Emulator integration: assigned owner can read the property; removed owner is denied
  by existing rules.
- Component tests: owners list renders; remove requires ConfirmDialog confirmation.
- `npm test` + `npm run typecheck` + `npm run test:integration` green before commit.

## Stop before

STOP and get human approval for risk gate #1 before implementing the members
write operations (assign / remove access). The read portion may proceed.
