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
Phase 0 (bootstrap, commands verified), Phase 1 (grilling → CONTEXT.md decision log,
ADR-0001…0007, AGENTS.md), and Phase 2 (CEB tariff research → ADR-0008 regime/band engine)
are complete as of 2026-07-04.
Phase 3 in progress: PRD `.scratch/owner-live-room-view/PRD.md` (owner login + live room view,
walking skeleton) is broken into 4 ready-for-agent vertical slices under
`.scratch/owner-live-room-view/issues/` (01 auth+bootstrap → 02 live telemetry → {03 tenancy,
04 offline}). Slices 01+02+03 implemented (TDD, all gates green) — committed locally, human
review owns the merge. ADR-0009 migration **hardware-verified** (Stage A smoke test 2026-07-04:
reflashed ESP32 → anonymous auth → rules → live dashboard). Device simulator
(scripts/simulate-device.ts) covers dev work; sensor bring-up waits for the PCB.
Slice 04 (offline honesty) implemented 2026-07-04 — **the walking skeleton (01–04) is complete**:
78 unit + 17 emulator-integration tests, all gates green, committed locally.
Next: issue 05 (UI design pass — specify then implement) → then next PRD (device control).
Issue tracker = local markdown under `.scratch/`.
Remaining open items (incl. verifying SSCL/VAT on a real bill) live at the bottom of CONTEXT.md.
