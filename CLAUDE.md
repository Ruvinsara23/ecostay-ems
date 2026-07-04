# CLAUDE.md — EcoStay EMS

Smart IoT energy management dashboard for tourist accommodations (Sri Lanka).
Next.js (App Router) + TypeScript + Tailwind/shadcn, Firebase RTDB + Auth.
An ESP32 node (firmware/complete.ino) is the data source and command target.

## Read these BEFORE any work, in order
1. `AGENTS.md` — stack, exact commands, risk gates, agent boundaries.
2. `CONTEXT.md` — ubiquitous language; every term tagged existing/derived/accepted/proposed/rejected.
   **Code may only use existing + derived + accepted terms.**
3. `docs/firmware-contract.md` — the immutable ESP32↔Firebase contract.
4. `docs/adr/` — hard-to-reverse decisions already made. Do not relitigate silently.

## Non-negotiables (from the project's development framework)
- Vertical slices only — one issue at a time, never horizontal layers.
- Test-first (TDD): red → green → refactor; `npm test` + `npm run typecheck` green before every commit.
- Stop and ask at risk gates: auth, Firebase security rules, device command semantics,
  data deletion, secrets, anything touching the firmware.
- The firmware contract is immutable (ADR-0003). The dashboard adapts to it, never the reverse.
- Human owns the merge. Passing tests never substitute for human review.

## Current phase
Phase 0 (bootstrap, commands verified) and Phase 1 (grilling → CONTEXT.md decision log,
ADR-0001…0007, AGENTS.md) are complete as of 2026-07-04.
Next: Phase 2 — research the current CEB tariff schedule (cited) → then Phase 3 PRD → issues.
Remaining open items live at the bottom of CONTEXT.md.
