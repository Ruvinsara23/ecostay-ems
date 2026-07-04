# AGENTS.md — EcoStay EMS

Operating manual for any agent (or human) working in this repo.
Read `CONTEXT.md` (vocabulary + decisions) and `docs/adr/` before changing anything.

## Stack (decided from requirements — see ADR-0002/0003/0004/0005/0006)

| Layer | Choice | Version (verified 2026-07-04) |
|---|---|---|
| Framework | Next.js (App Router, `src/` layout, `@/*` alias) | 16.2.10 |
| Language | TypeScript, `strict` | 5.x |
| UI | Tailwind CSS v4 + shadcn/ui (add components one-by-one) | tw ^4 |
| Data / auth | Firebase RTDB + Firebase Auth (web SDK) | firebase ^12.15.0 |
| Server logic | Firebase Cloud Functions (Blaze) — the ONLY always-on runtime | — |
| Admin ops | Firebase Admin SDK behind Next API routes only | — |
| Tests | Vitest + Testing Library (jsdom) | vitest ^4.1.9 |
| Firmware | `firmware/complete.ino` (ESP32) — immutable contract, see `docs/firmware-contract.md` | — |

## Package manager & commands (npm — every command below was run and verified)

```bash
npm install            # install deps
npm run dev            # dev server → http://localhost:3000
npm test               # Vitest, single run — must be green before every commit
npm run test:watch     # Vitest watch mode (TDD loop)
npm run typecheck      # tsc --noEmit — must be green before every commit
npm run lint           # eslint
npm run build          # production build
npx shadcn@latest add <component>   # vendor a ui component into src/components/ui/
```

## Risk gates — STOP and get human approval before touching

1. **Auth & roles**: Firebase Auth flows, custom claims, session handling, anything under an Admin SDK API route.
2. **RTDB security rules**: any change, including the transitional anonymous-device ruleset and its deletion at cutover.
3. **Device commands**: semantic changes to writes under `properties/*/rooms/*/devices/*`. These flip real relays in guest rooms. Never target `mainRelay` (firmware reads it but ignores it — ADR-0003).
4. **Data deletion / retention**: energyHistory pruning, aggregate rewrites, alert deletion. Prune jobs need explicit review of what they delete.
5. **Secrets**: service-account keys, `.env.local`. Never committed, never logged, never echoed into build output.
6. **Deploys**: Cloud Functions / hosting deploys run on a billed (Blaze) project — human runs or approves every deploy.
7. **Firmware**: `firmware/complete.ino` is untouchable outside the approved firmware workstream (ADR-0007). No ad-hoc edits ever.
8. **Money-facing math**: the tariff/cost calculator ships only with cited current CEB rates (open research item) and human-reviewed math. No invented rates, even as placeholders shown in UI.

(No payments processing and no PII beyond auth emails exist in this system.)

## Agent boundaries

**Free (no approval needed)**
- Read anything in the repo; run the commands above.
- UI components/pages, hooks, pure logic + their tests, inside the current issue's slice.
- Add shadcn/ui components; refactor strictly within the current slice.
- Write/adjust tests, fixtures, and the dev seeder (dev tool only — never part of demo/prod).

**Ask first**
- New dependencies beyond the table above.
- New or changed RTDB paths under `properties/*` (schema is shared with firmware and Functions).
- Anything listed under Risk gates.
- `git push` / anything touching a remote — the human owns the merge and the remote.

**Never**
- Commit secrets or `.env.local`.
- Use a `proposed`-status term from CONTEXT.md in code.
- Re-derive occupancy client-side, or put background logic in the browser (rejected decisions — CONTEXT.md).
- Present seeded/simulated data as real: simulated energy values carry a "simulated" label until ADR-0007 lands real PZEM reads.

## Working discipline (non-negotiables)

- One vertical slice (one issue) at a time — never horizontal layers.
- TDD: red → green → refactor. `npm test` AND `npm run typecheck` green before **every** commit.
- Max 3 attempts on a failing step, then stop and report honestly.
- Commit messages: outcome, key decisions, files changed, verification, blockers.

## Environment notes (this machine)

- Windows 11, Git Bash + PowerShell; Node v24.12.0, npm 10.9.2.
- Dev server port 3000; kill strays with `netstat -ano | grep :3000` → `taskkill //F //PID <pid>`.
- `.env.local` carries the Firebase web config (values match the firmware's project). `.env.example` is the committed template.
- npm on this network occasionally drops (`ECONNRESET`) — retry with `--fetch-retries=5`.
- `npm run test:integration` (Firebase emulators) needs **Java 21+**. System Java is 17; a portable
  Temurin 21 JRE lives at `C:\Users\pansi\.jdks\jdk-21.0.11+10-jre` — prefix its `bin` onto PATH
  for the run: `$env:PATH = "C:\Users\pansi\.jdks\jdk-21.0.11+10-jre\bin;$env:PATH"`.
