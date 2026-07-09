# PRD: Admin Console Stabilization

Status: active
Feature slug: admin-console-stabilization
Created: 2026-07-09
Parent feature: `.scratch/admin-console/PRD.md`

## Why

The Admin Console implementation slices exist, but "implemented" is not the same as "accepted."
The owner/admin routing, save workflows, environment setup, and published rules state need a focused
bug-bash before new feature or firmware work continues.

This tracker is intentionally separate from `.scratch/admin-console/PRD.md`. The original PRD records
the build scope; this stabilization tracker records defects and acceptance checks.

## Scope

- Verify Admin Console access behavior for `admin` and `owner` accounts.
- Verify Admin Console save flows against local/dev Firebase configuration.
- Verify Admin SDK routes fail safely and show actionable UI errors.
- Verify any rule-dependent Admin Console feature has matching local rules and a human publish note.
- Keep fixes small, test-first, and one issue at a time.

## Out of Scope

- New Admin Console features.
- Firmware workstream changes.
- RTDB rules publishing or production deploys.
- Service-account key rotation by Codex.
- Reworking the original Admin Console PRD unless the human explicitly asks.

## Risk Gates

- #1 Auth and roles: any change to claims, session handling, login routing, or Admin SDK routes.
- #2 RTDB security rules: any `database.rules.json` change.
- #5 Secrets: service-account credentials and `.env.local` are never printed, committed, or read into output.
- #6 Deploys: human-owned.

## Stabilization Issues

1. `issues/01-admin-access-and-role-sanity.md`
2. `issues/02-admin-save-failure-triage.md`
3. `issues/03-admin-console-workflow-acceptance.md`
4. `issues/04-local-prod-state-and-ops-checklist.md`

## Acceptance Bar

- Owner account cannot render `/admin`.
- Admin account can render `/admin`.
- Each Admin Console save path either succeeds locally or fails with a specific, actionable message.
- Unit and emulator tests cover any code fix.
- `npm test` and `npm run typecheck` pass before every commit.
- UI-affecting fixes are visually checked before being called done.

## Current Known State

- `/admin` existed before the firmware workstream commits and is part of Admin Console.
- The accidental UI cleanup commit `eff39f1` has been reverted by `60c832b`.
- Local `main` is ahead of `origin/main`; no push/deploy has been performed by Codex.
- `debug.log` is untracked and intentionally untouched.
