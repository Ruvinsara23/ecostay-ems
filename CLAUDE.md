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

## Current state → see `docs/HANDOFF.md`

**v1 is feature-complete and deployed** (`https://ecostay-ems.vercel.app`, as of 2026-07-07):
auth+tenancy, live telemetry, device control, server workloads (sampler/alerts/automation/rollup),
charts+alert-center, tariff cost (H-1), and OBJ-07 savings. 167 unit + 32 emulator tests green;
all committed & pushed. Phases 0–5 + tariff + savings done.

`docs/HANDOFF.md` is the single source of "what's built / what's pending / what's next" — read it
first. Pending items are human/ops (live device for data, rotate the service-account key, verify
SSCL on a real bill). Next candidate phases: **Admin UI** (risk gate #1), the **firmware workstream**
(ADR-0007), v1.1. Issue tracker = local markdown under `.scratch/`; remaining open items also at the
bottom of CONTEXT.md.
