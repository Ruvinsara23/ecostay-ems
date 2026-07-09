# 03 - Admin Console Workflow Acceptance

Status: pending
Parent: `.scratch/admin-console-stabilization/PRD.md`

## Bug Class

The Admin Console can be implemented but still feel unfinished or confusing. Acceptance requires
checking the actual workflows on screen, not only unit tests.

## Goal

Visually verify the Admin Console workflows and capture any layout, copy, loading, or navigation
defects as separate fix slices.

## Scope

- Settings view.
- Rooms view.
- Owners view.
- Device credential panel in Rooms.
- Owner-denied route behavior.
- Mobile and desktop sanity checks.

## Risk Gates

- None for visual review only.
- Any resulting code fix follows the relevant gate for that defect.

## Test Plan

- Screenshot/visual check using the repo's headless workflow.
- Add focused unit tests only for defects fixed in code.
- `npm test`
- `npm run typecheck`

## Stop Point

Do not broaden into redesign or new Admin Console features.
