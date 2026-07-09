# 02 - Admin Save Failure Triage

Status: pending
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

## Stop Point

Do not use production service-account credentials until the leaked key is rotated.
