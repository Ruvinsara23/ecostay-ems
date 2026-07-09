# 04 - Local/Prod State And Ops Checklist

Status: pending
Parent: `.scratch/admin-console-stabilization/PRD.md`

## Bug Class

Local code, local Firebase emulator state, real Firebase Auth claims, published RTDB rules, and Vercel
deployment state can diverge. That makes a correct local fix look broken in the browser.

## Goal

Create a short operational checklist that explains what is local-only, what is published, and what a
human must do before production use.

## Scope

- Local commits ahead of `origin/main`.
- Published rules status.
- Firebase Auth custom claim checks for `admin@gmail.com` and `user@gmail.com`.
- Service-account key rotation prerequisite.
- Device account provisioning production block.

## Risk Gates

- #5 Secrets.
- #6 Deploys.
- #1 Auth and roles if claims are changed.
- #2 RTDB rules if rules are published or changed.

## Test Plan

- Documentation-only unless an actual code defect is found.
- Human-reviewed commands for any live Firebase operation.

## Stop Point

Do not deploy, publish rules, rotate keys, or change live claims without explicit human action.
