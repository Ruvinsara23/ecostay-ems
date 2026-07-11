import { fleetStatus, listProperties } from '@/server/admin-directory';
import { getAdminAuth, getAdminDatabase } from '@/server/admin-app';
import { authorizeAdmin } from '@/server/admin-token';

// firebase-admin needs the Node runtime - never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-console browse layer (admin-console-v2 slice 02): snapshot property list.
 * `?view=status` returns fleet health instead (slice 09 Overview).
 */
export async function GET(request: Request) {
  const auth = await authorizeAdmin(request.headers.get('authorization'), (token) =>
    getAdminAuth().verifyIdToken(token),
  );
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  if (new URL(request.url).searchParams.get('view') === 'status') {
    return Response.json({ properties: await fleetStatus(getAdminDatabase(), Date.now()) });
  }
  return Response.json({ properties: await listProperties(getAdminDatabase()) });
}
