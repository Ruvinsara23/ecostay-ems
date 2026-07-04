# 07 — Deployment runbook + live cron verification

Status: ready-for-agent
Slice: 7 of 7 · Parent: `.scratch/server-workloads/PRD.md`

## What to build

`docs/runbook-free-runtime.md`: human-run steps — Vercel Hobby project (CLI or GitHub),
env vars (`FIREBASE_SERVICE_ACCOUNT` JSON, `CRON_SECRET` generated, `NEXT_PUBLIC_*`),
cron-job.org account with the three jobs (1-min tick, 5-min sample, daily rollup Asia/Colombo,
bearer header), and a verification checklist (401 without secret; samples/alerts appearing;
Vercel logs). Risk gates #5 (secrets) and #6 (deploys) are the human's steps by design.

## Acceptance criteria

- [ ] A teammate can deploy from the runbook alone.
- [ ] Live verification: cron-job.org fires all three; data lands in `ecostay-ems`; unauthorized calls 401.
- [ ] No secret ever enters the repo.

## Blocked by

- Slices 01–04 (endpoints must exist).
