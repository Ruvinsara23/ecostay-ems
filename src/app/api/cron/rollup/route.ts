import { getAdminDatabase } from '@/server/admin-app';
import { createRollupDeps } from '@/server/admin-deps';
import { colomboYesterdayKey } from '@/server/colombo-time';
import { isCronAuthorized } from '@/server/cron-auth';
import { pruneSamples, rollupDaily } from '@/server/rollup';

// firebase-admin needs the Node runtime — never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NINETY_DAYS_MS = 90 * 86_400_000;

/**
 * Nightly rollup (daily 00:05 Asia/Colombo via cron-job.org). Pruning is
 * RISK GATE #4: it deletes only when BOTH ?confirmPrune=true is passed AND the
 * human has set PRUNE_ENABLED=true after reviewing dry-run reports.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(request.url);
  const now = Date.now();
  const date = url.searchParams.get('date') ?? colomboYesterdayKey(now);
  const confirm =
    url.searchParams.get('confirmPrune') === 'true' && process.env.PRUNE_ENABLED === 'true';

  const deps = createRollupDeps(getAdminDatabase());
  const rollup = await rollupDaily(deps, date);
  const prune = await pruneSamples(deps, now - NINETY_DAYS_MS, { confirm });

  return Response.json({ date, rollup, prune });
}
