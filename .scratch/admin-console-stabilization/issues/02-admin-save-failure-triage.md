# 02 - Admin Save Failure Triage

Status: in-progress
Parent: `.scratch/admin-console-stabilization/PRD.md`

## Bug Class

The user previously saw "Could not save - try again." Admin Console save failures need to be split
into UI validation, RTDB rules denial, Admin SDK auth failure, and missing environment/credential
cases.

## Goal

Make every Admin Console save failure actionable and verify the successful save paths locally.

## Scope

- Reproduce each save path:
  - tariff category;
  - circuit wattages;
  - alert thresholds;
  - room registration;
  - owner create/disable/reset;
  - device account create/reset.
- Keep user-facing errors specific enough to act on.
- Do not log or expose secrets.

## Risk Gates

- #1 Auth and roles for Admin SDK route behavior.
- #2 RTDB rules if a rules change is needed.
- #5 Secrets for service-account environment checks.

## Test Plan

- Unit tests with fake ports for UI error messages.
- Emulator tests for route/rules behavior where applicable.
- `npm test`
- `npm run typecheck`

## Progress

### 2026-07-09 - Settings save error classification

Fixed the Admin Settings form path that was collapsing Firebase write failures into the generic
"Could not save - try again." message.

- Scope changed: `src/admin/admin-settings.tsx`, `src/admin/admin-settings.test.tsx`
- Risk gates tripped: none. This is UI error handling through the existing `RoomDataSource` port;
  no auth flow, rules file, secrets, or deploy changed.
- Behavior: Firebase rules denial now shows an actionable message naming the rules boundary and
  `database.rules.json` publish check.
- Red/green: added a failing fake-backed unit test for RTDB rules denial, then implemented the
  mapper and stale-error clearing.
- Verification: `npm.cmd test -- src/admin/admin-settings.test.tsx`, `npm.cmd test`, and
  `npm.cmd run typecheck` passed.

Remaining paths in this issue:

- local/dev Firebase environment mismatch checks.

### 2026-07-09 - Admin SDK operation error surfaces

Closed the fake-backed UI coverage for Admin SDK save/action failures.

- Scope changed: `src/admin/admin-owners.tsx`, `src/admin/admin-owners.test.tsx`,
  `src/admin/admin-rooms.test.tsx`
- Risk gates tripped: none. This only changes UI error display around the existing
  `AdminOperations` port; no API route, auth claim, rules, secret, or deploy changed.
- Behavior: owner disable/reset failures now render an alert instead of escaping as unhandled
  rejections; reset failures clear any stale reset link for that owner.
- Coverage: room registration error was already covered; added device-account error coverage and
  owner disable/reset error coverage.
- Verification: `npm.cmd test -- src/admin/admin-rooms.test.tsx src/admin/admin-owners.test.tsx`,
  `npm.cmd test`, and `npm.cmd run typecheck` passed.

Remaining path in this issue:

- local/dev Firebase environment mismatch checks.

## Stop Point

Do not use production service-account credentials until the leaked key is rotated.
