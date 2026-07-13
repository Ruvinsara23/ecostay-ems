# EcoStay EMS

Smart IoT energy-management system for Sri Lankan tourist accommodations. An ESP32 per room
writes telemetry to Firebase RTDB; a Next.js dashboard gives owners live monitoring, device
control, cost, savings, and safety alerts. Admins manage properties, rooms, owners, and device
provisioning.

Live: <https://ecostay-ems.vercel.app> (auto-deploys from `main`).

## Stack

Next.js (App Router) · TypeScript · Tailwind v4 / shadcn · Firebase Realtime Database + Auth ·
Vercel serverless + cron. **npm only** — no yarn/pnpm/bun.

## Read these before changing anything

1. **`AGENTS.md`** — stack, exact commands, risk gates, boundaries.
2. **`CONTEXT.md`** — the ubiquitous language. Code may only use existing/derived/accepted terms.
3. **`docs/firmware-contract.md`** — the immutable ESP32↔Firebase contract (ADR-0003). The
   dashboard adapts to the firmware, never the reverse.
4. **`docs/adr/`** — decisions already made; don't relitigate silently.
5. **`docs/HANDOFF.md`** — what's built, what's pending, what's next. **Start here.**

## Commands

```bash
npm run dev              # dev server (http://localhost:3000)
npm test                 # unit tests (fake-backed, fast)
npm run typecheck
npm run lint
npm run build
npm run test:integration # Firebase emulator tests — needs Java 21 on PATH
npm run seed             # bootstrap accounts + property/room (Admin SDK, human-run)
```

`npm test` + `npm run typecheck` must be green before every commit.

## Risk gates — stop and ask a human

Auth/session, **RTDB security rules**, device command semantics, data deletion, secrets, deploys,
firmware, and money-facing math. Passing tests never substitute for human review.

> **RTDB rules are not auto-deployed.** `database.rules.json` is the canonical copy; after any
> change a human must republish it in the Firebase console. See `docs/HANDOFF.md` for the
> currently-unpublished changes.

## Layout

| Path | What |
|---|---|
| `src/app/` | Routes: owner dashboard (`/`), admin console (`/admin`), API routes, cron endpoints |
| `src/rooms/` | Room views + the `RoomDataSource` port (Firebase adapter + in-memory fake) |
| `src/admin/` | Admin console UI + the `AdminOperations` port |
| `src/server/` | Server workloads (sampler, alert tick, rollup, notifications) as pure `(deps, now) → effect` |
| `src/tariff/` | CEB tariff/bill engine, savings, §10.2 validation |
| `src/telemetry/` | Firmware-contract types + derived terms (freshness, occupancy) |
| `firmware/` | The ESP32 sketch (`complete.ino`) — **never commit real WiFi/device credentials** |
| `scripts/` | Dev tools: `seed.ts`, `simulate-device.ts`, `validate-savings.ts` |

**The one seam:** UI depends only on the `AuthGateway`, `RoomDataSource`, and `AdminOperations`
ports — never on the Firebase SDK directly. Each has a fake (fast unit tests) and a real adapter
(emulator integration tests). Preserve this; it's why everything is testable.
