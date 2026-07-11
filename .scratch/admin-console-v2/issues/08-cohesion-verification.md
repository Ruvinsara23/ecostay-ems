# 08 - UI cohesion + on-screen verification

Status: done (2026-07-11) — 2-reviewer adversarial pass (2 blockers fixed: owners silent-empty, credential bleed), desktop+mobile screenshots verified (mobile via CDP emulation)
Parent: `.scratch/admin-console-v2/PRD.md`

## Goal

Close the feature: one cohesion pass so the whole console reads as a single designed
system in the user-owned lavender/glass aesthetic, verified on-screen — not shipped
blind — plus the AUDIT G hygiene items that touch this workstream's files.

## Scope

- Cohesion pass across all admin-console-v2 surfaces: consistent spacing, list rows,
  field styles, empty/loading/error treatments — all via the `src/ui/` primitives,
  no per-view drift. No restyle of the existing aesthetic (PRD risk gates).
- On-screen verification per the repo rule (AGENTS.md; headless Chrome screenshots):
  Properties list, property detail (Rooms/Devices/Owners/Settings sections),
  Owners global view, and the owner dashboard post-slice-00 — desktop and mobile.
- AUDIT G hygiene items that touch files changed by this workstream:
  - Verify the duplicated rails and duplicated `TextField`/`NumberField`/`fieldClass`
    variants are fully retired (no stragglers left behind by slices 01-07).
  - Remove stray `console.log`s in files this workstream touched.
  - Remove dead imports/code left over from the shell/view migrations.
- Out of scope: FCM/notifications items (AUDIT A/B FCM findings — separate
  finish-or-remove decision), owner-dashboard half-built tabs (AUDIT E).

## Risk gates

- None. Visual/hygiene pass only; no auth, rules, routes, or data-path changes.
- UI is user-owned: cohesion within the existing design, not a new look.

## Test plan

- Full suite green: `npm test` + `npm run typecheck` (+ `npm run test:integration`
  unchanged).
- Screenshot checklist captured for every view above, desktop + mobile, and compared
  against the existing dashboard aesthetic.
- Grep-level check: no `console.log` or dead exports in files touched by slices 00-07.

## Stop before

Human reviews the screenshots and signs off before the feature is declared done —
passing tests never substitute for human review of the visual result.
