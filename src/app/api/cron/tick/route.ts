import { getAdminDatabase } from '@/server/admin-app';
import { createAlertsDeps, createAutomationDeps } from '@/server/admin-deps';
import { evaluateAlerts } from '@/server/alerts';
import { runAutomation } from '@/server/automation';
import { isCronAuthorized } from '@/server/cron-auth';

// firebase-admin needs the Node runtime — never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 1-minute tick (ADR-0010): offline + threshold alerts, then vacancy-cutoff automation. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const db = getAdminDatabase();
  const now = Date.now();
  const alerts = await evaluateAlerts(createAlertsDeps(db), now);
  const automation = await runAutomation(createAutomationDeps(db), now);
  return Response.json({ alerts, automation });
}
