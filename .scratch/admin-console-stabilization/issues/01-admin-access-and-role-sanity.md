# 01 - Admin Access And Role Sanity

Status: code-guard-verified
Parent: `.scratch/admin-console-stabilization/PRD.md`

## Bug Class

The user observed `/admin` opening and questioned whether that is wrong. The route itself is expected
for `role: "admin"`, but it must never render for `role: "owner"`.

## Goal

Prove the behavior in local code and identify whether any real-account issue is caused by stale or
incorrect Firebase custom claims rather than route code.

## Scope

- Confirm `RequireAdmin` behavior:
  - admin renders;
  - owner redirects to `/`;
  - signed-out redirects to `/login?next=/admin`.
- Confirm login does not auto-route admins to `/admin` after the reverted UI cleanup.
- Add or adjust tests only if a gap is found.
- Provide safe owner/admin claim-check instructions without printing secrets.

## Risk Gates

- #1 Auth and roles if code changes are required.
- #5 Secrets if checking live Firebase accounts. Do not read service-account JSON into output.

## Test Plan

- `npm test -- src/auth/require-admin.test.tsx src/app/login/page.test.tsx`
- If a defect is found: add a failing test first, then fix.
- For live account claims: human runs or approves a scoped Admin SDK check/reset.

## Stop Point

Do not change Firebase custom claims or auth code without explicit human approval for gate #1.

## Verification Result

- `npm test -- src/auth/require-admin.test.tsx src/app/login/page.test.tsx`
  - 2 files passed
  - 10 tests passed
- Current code behavior:
  - `role: "admin"` renders `/admin`;
  - `role: "owner"` redirects from `/admin` to `/`;
  - signed-out redirects to `/login?next=%2Fadmin`;
  - login redirects to `next` or `/`, not automatically to `/admin`.

## Current Diagnosis

If a real owner account can render `/admin`, the next suspect is live Firebase Auth state:

- the account has the wrong custom claim;
- the browser still has a stale admin ID token/session;
- the user is signed in with a different account than expected.
