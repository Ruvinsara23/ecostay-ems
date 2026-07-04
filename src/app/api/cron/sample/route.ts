import { getAdminDatabase } from '@/server/admin-app';
import { createSamplerDeps } from '@/server/admin-deps';
import { isCronAuthorized } from '@/server/cron-auth';
import { sampleEnergy } from '@/server/sample-energy';

// firebase-admin needs the Node runtime — never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 5-minute energy sampler endpoint (ADR-0010). Called by cron-job.org. */
export async function GET(request: Request) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  const report = await sampleEnergy(createSamplerDeps(getAdminDatabase()), Date.now());
  return Response.json(report);
}
