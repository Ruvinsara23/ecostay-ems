# ADR-0004: Tooling — npm, Vitest + Testing Library, Tailwind + shadcn/ui

Date: 2026-07-04 · Status: Accepted

## Context
The workflow is TDD-first with a green feedback loop required before every commit;
the previous build shipped with **no** test or typecheck script. Team machine is Windows 11,
Node v24 / npm 10 preinstalled.

## Decision
- Package manager: **npm** (zero extra setup, works on uni machines).
- Tests: **Vitest** + **@testing-library/react** (jsdom). Playwright may be added later for e2e — separate decision.
- Typecheck: `tsc --noEmit`, wired as `npm run typecheck`.
- Styling/components: **Tailwind CSS + shadcn/ui**, adding components one-by-one as needed —
  never a bulk dump of the whole catalog (the old build carried ~40 unused ui components).

## Consequences
- Exact commands live in AGENTS.md and must stay runnable; CI (when added) runs the same four:
  test, typecheck, lint, build.
- shadcn components are vendored source under `src/components/ui/` — reviewed like our own code.
