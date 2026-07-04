# ADR-0010: Free server runtime — Vercel serverless + external cron (amends ADR-0006)

Date: 2026-07-04 · Status: Accepted

## Context
ADR-0006 put all background workloads in Firebase Cloud Functions, which requires the Blaze
plan — a credit card the team cannot put on the project ("need free option", user decision
2026-07-04). The five workloads still need a runtime that isn't a browser tab. Firebase-native
scheduling is Blaze-only; GitHub Actions cron is too coarse/unreliable for minute-level checks
(5-min floor, routinely 15–30 min late).

## Decision
The server logic ships as **runtime-agnostic handler functions** in this repo, executed by
**Next.js API routes (Node runtime, firebase-admin)** deployed on **Vercel Hobby (free)** and
triggered by **cron-job.org (free)** schedules calling secret-protected endpoints:

| Endpoint | Schedule | Workloads |
|---|---|---|
| `/api/cron/sample` | every 5 min | energy sampler → `energyHistory` |
| `/api/cron/tick` | every 1 min | offline detector, alert evaluator (gas/temp/water), automation (vacancy cutoff on observed occupancy transitions) |
| `/api/cron/rollup` | daily 00:05 Asia/Colombo | daily aggregates; 90-day raw pruning |

- Endpoints require `Authorization: Bearer ${CRON_SECRET}`; anything else → 401, no work.
- Admin SDK credentials (`FIREBASE_SERVICE_ACCOUNT` JSON) and `CRON_SECRET` live in Vercel
  project env vars — never in the repo (risk gate #5). Deploys are human-run (risk gate #6).
- Event-driven triggers are replaced by 1-minute polling with a persisted last-seen state
  under a dashboard-owned `ops/` subtree (Admin-SDK-only; no client rules exposure).

## Consequences
- **Latency is honest**: automation and alert detection react within ~60 s of a transition
  (plus the 15 s/90 s freshness semantics), not sub-second. Acceptable: the firmware handles
  the only safety-critical response (gas → buzzer + fan) locally and instantly; vacancy
  cutoff and notifications are energy/awareness features.
- Handlers stay pure (`(db, nowMs) → effects`) and unit/emulator-testable; if Blaze ever
  becomes possible, they lift into Cloud Functions unchanged and ADR-0006's original shape
  is restored — only the trigger wiring changes.
- The dashboard gains its first real deployment (Vercel) — also free hosting for the demo.
- Existing RTDB rules already cover the new reads (members read their property subtree;
  `energyHistory`/`dailyAggregates`/`alerts`/`automationLog` live under `properties/{pid}`);
  writes come from the Admin SDK, which bypasses rules. The `ops/` subtree gets no client
  access at all.
- Sri Lanka has no Vercel/cron-job.org billing exposure: both free tiers suffice by orders
  of magnitude (3 cron jobs; ~46k invocations/month, each < 1 s).
