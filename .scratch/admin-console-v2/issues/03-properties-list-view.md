# 03 - Properties list view

Status: planned
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

Make `/admin` browse-first: a Properties list as the default admin view, ending the
blind free-text ID typing UX (AUDIT F: a typo silently creates a NEW property).

## Scope

- Properties list view at `/admin` (inside the slice-01 chassis), rendering
  `listProperties()` from slice 02: name, id, #rooms, #owners, #devices online.
- Click a row navigates to `/admin/properties/[pid]` (detail page arrives in slice 05;
  a minimal detail shell/placeholder route is acceptable until then).
- Build FROM the `src/ui/` primitives (`ListRow` etc.) — no copy-pasted markup.
- Snapshot read with a manual refresh control (PRD decision 2).
- Proper loading / empty / error states (AUDIT F: current admin views have none;
  do not swallow fetch failures into an empty list).
- Preserve the user-owned lavender/glass design.

## Risk gates

- None new. Consumes the slice-02 read; UI-only slice.
- UI is user-owned: wiring + a new well-designed view in the existing aesthetic,
  not a restyle.

## Test plan

- Component tests against `FakeAdminOperations`: renders rows with name + counts;
  loading, empty, and error states each render distinctly.
- Test: row click navigates to the property-detail route.
- Test: manual refresh re-fetches.
- `npm test` + `npm run typecheck` green before commit.

## Stop before

Nothing — no human approval required for this slice.
