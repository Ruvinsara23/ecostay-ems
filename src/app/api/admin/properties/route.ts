import { listProperties } from '@/server/admin-directory';
import { getAdminAuth, getAdminDatabase } from '@/server/admin-app';
import { authorizeAdmin } from '@/server/admin-token';

// firebase-admin needs the Node runtime - never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-console browse layer (admin-console-v2 slice 02): snapshot property list. */
export async function GET(request: Request) {
  const auth = await authorizeAdmin(request.headers.get('authorization'), (token) =>
    getAdminAuth().verifyIdToken(token),
  );
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  return Response.json({ properties: await listProperties(getAdminDatabase()) });
}
