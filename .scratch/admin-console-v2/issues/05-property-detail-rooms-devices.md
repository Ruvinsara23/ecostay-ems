# 05 - Property detail: Rooms + Devices

Status: planned
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

A real property-detail page at `/admin/properties/[pid]` with Rooms and Devices
sections: everything listed with status, and the existing create forms inlined so the
admin acts where they browse.

## Scope

- **Rooms section**: registered rooms from slice-04 `listRooms` — name, id,
  device-account status, online/last-seen. Register-room form inline, reusing the
  existing form logic from `src/admin/admin-rooms.tsx` (rebuilt on `src/ui/` fields).
- **Devices section**: per-room device account (exists? provisioned? online) from
  slice-04 `listDevices`; create/reset device credential inline, reusing the existing
  slice-01 admin-console UI and its already-approved `/api/admin/devices` route.
- Property id comes from the route — no free-text propertyId boxes in these inline
  forms (kills more of AUDIT F's blind ID entry).
- Credential reset goes through `ConfirmDialog` (AUDIT B: destructive actions fire
  with no confirmation, `src/admin/admin-rooms.tsx:221-229`).
- Loading / empty / error states for both sections; manual refresh; lists refresh
  after a successful register/create/reset.
- Preserve the lavender/glass design; build from `src/ui/` primitives.

## Risk gates

- None new. Reads were gated in slice 04; writes reuse the existing, already-approved
  register-room and device-credential routes with unchanged semantics.
- Device passwords remain shown-once, never persisted to RTDB (unchanged from the
  admin-console slice-01 behavior).

## Test plan

- Component tests against the fake: rooms render with status; devices render with
  account/online status; empty and error states.
- Test: register room and create/reset credential flows work inline with propertyId
  pre-bound from the route; reset requires ConfirmDialog confirmation.
- Test: successful mutation triggers a list refresh.
- `npm test` + `npm run typecheck` green before commit.

## Stop before

Nothing new — device-credential semantics are unchanged; flag any change to them.
