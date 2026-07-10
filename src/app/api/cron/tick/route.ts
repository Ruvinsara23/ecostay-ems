import { getAdminDatabase } from '@/server/admin-app';
import { createAlertsDeps, createAutomationDeps } from '@/server/admin-deps';
import { evaluateAlerts } from '@/server/alerts';
import { runAutomation } from '@/server/automation';
import { isCronAuthorized } from '@/server/cron-auth';
import { createNotificationsDeps, dispatchNotifications } from '@/server/notifications';

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

  if (alerts.newlyOpened.length > 0) {
    // Await the dispatch: on serverless the function freezes after returning,
    // which silently kills floating promises. Its own catch keeps a push
    // failure from ever breaking the alert/automation tick.
    try {
      await dispatchNotifications(createNotificationsDeps(db), alerts.newlyOpened);
    } catch (error) {
      console.error('[cron/tick] notification dispatch failed', error);
    }
  }

  const automation = await runAutomation(createAutomationDeps(db), now);
  return Response.json({ alerts, automation });
}
