# Runbook: free server runtime (ADR-0010) — Vercel + cron-job.org

Human-run deployment of the server workloads. Every step here is deliberately yours:
secrets (risk gate #5) and deploys (risk gate #6) never run agent-side.
Both services are free; neither needs a card.

## 0. Prerequisites (once)

- [ ] `database.rules.json` published in the Firebase console (RTDB → Rules → paste from the
      repo → Publish). The current file includes: automation toggle, `.indexOn: sampledAt`,
      alert-acknowledge rules.
- [ ] Generate a cron secret (long random string), e.g. in PowerShell:
      `-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 48 | % {[char]$_})`
      Keep it — you'll paste it into BOTH Vercel and cron-job.org.

## 1. Vercel (free Hobby plan)

1. Create an account at vercel.com (GitHub sign-in is fine).
2. Deploy this repo. Two options:
   - **CLI (no GitHub remote needed):** `npm i -g vercel`, then `vercel` in the repo root,
     accept defaults (framework: Next.js), then `vercel --prod`.
   - **Git integration:** push the repo to a private GitHub repo first, then "Import Project".
3. Project → Settings → Environment Variables (Production):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | from `.env.local` |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from `.env.local` |
   | `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | from `.env.local` |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | from `.env.local` |
   | `CRON_SECRET` | the generated secret |
   | `FIREBASE_SERVICE_ACCOUNT` | the ENTIRE service-account JSON, pasted as one value |
   | `PRUNE_ENABLED` | *(do not set — only after approving a prune dry-run report)* |

   The service-account JSON is the same file the seeder uses (`~/.secrets/ecostay-ems-…json`).
   Open it, copy ALL its contents, paste as the value. Never commit it anywhere.
4. Redeploy after setting env vars (`vercel --prod` again, or the dashboard "Redeploy").
5. Note your production URL, e.g. `https://ecostay-ems.vercel.app`.

## 2. cron-job.org (free)

Create an account, then three jobs. For EACH job set a custom header:
`Authorization: Bearer <CRON_SECRET>` (Advanced → Headers).

| Job | URL | Schedule |
|---|---|---|
| tick | `https://<your-app>/api/cron/tick` | every 1 minute |
| sample | `https://<your-app>/api/cron/sample` | every 5 minutes |
| rollup | `https://<your-app>/api/cron/rollup` | daily 00:05, timezone Asia/Colombo |

## 3. Verify (checklist)

- [ ] `curl https://<your-app>/api/cron/sample` (no header) → `401 {"error":"unauthorized"}`.
- [ ] `curl -H "Authorization: Bearer <secret>" https://<your-app>/api/cron/sample` →
      JSON report like `{"sampled":1,"skippedNoData":0,"skippedStale":0}` (sampled ≥ 1 only
      while the ESP32 or simulator is writing).
- [ ] cron-job.org shows all three jobs green after their first runs.
- [ ] Firebase console → RTDB: `properties/property_001/energyHistory/room_001` grows every
      5 min; `ops/lastOccupancy` updates every minute.
- [ ] Dashboard: the Energy history chart gains points; unplug/stop the device → within
      ~2 min an open "Device offline" alert appears in the Alert center; reconnect →
      it auto-resolves.
- [ ] Vercel → Deployments → Functions logs show the cron hits (useful when debugging).

## 4. Prune enablement (risk gate #4 — later)

After ~90 days of data (or whenever curious): read the `prune` block of the rollup
response — it reports how many samples WOULD be deleted. When you're satisfied,
set `PRUNE_ENABLED=true` in Vercel env and change the rollup job URL to
`…/api/cron/rollup?confirmPrune=true`. Until both are done, pruning never deletes anything.

## Notes

- Free-tier headroom: ~46k invocations/month, each well under a second — orders of magnitude
  inside Vercel Hobby limits; cron-job.org free covers 3 jobs at these rates.
- If Blaze ever becomes possible, the handlers in `src/server/` lift into Cloud Functions
  unchanged (ADR-0010) and the cron-job.org jobs are simply deleted.

## Troubleshooting: static 500 before the handler

An Admin or cron endpoint called without credentials should still reach its handler and return
its JSON `401` response. If it returns Vercel's static HTML `/500` page instead, the serverless
function failed during module loading; do not start by changing Firebase claims, RTDB rules, or
service-account values.

The 2026-07-16 incident was caused by `firebase-admin@14.1.0 -> jwks-rsa@4 -> jose@6`: a
CommonJS dependency required an ESM-only package at cold start. The repo intentionally pins
`firebase-admin` to the production dependency `13.10.0`, whose runtime chain uses
`jwks-rsa@3` / `jose@4`. Preserve the exact pin until an upgraded chain is verified in a Vercel
function, not only with local `next dev` or `next build`.

Checks:

1. `npm ls firebase-admin jwks-rsa jose --omit=dev --all` should show the pinned Admin SDK chain.
2. `node -e "require('firebase-admin/app'); require('firebase-admin/auth'); require('firebase-admin/database')"`
   must exit successfully.
3. After deployment, call an Admin endpoint without a bearer token. A JSON `401` proves the
   module loaded and the handler ran; a static HTML `500` means the cold start still failed.
4. Then sign in as Admin and inspect Vercel function logs before changing any credential or role.
