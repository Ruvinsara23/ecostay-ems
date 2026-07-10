import { listRooms } from '@/server/admin-directory';
import { getAdminAuth, getAdminDatabase } from '@/server/admin-app';
import { authorizeAdmin } from '@/server/admin-token';
import { isRoomScopeId } from '@/server/manage-device';

// firebase-admin needs the Node runtime - never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Admin-console browse layer (admin-console-v2 slice 04): rooms + device status. */
export async function GET(request: Request) {
  const auth = await authorizeAdmin(request.headers.get('authorization'), (token) =>
    getAdminAuth().verifyIdToken(token),
  );
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  const propertyId = new URL(request.url).searchParams.get('propertyId') ?? '';
  if (!isRoomScopeId(propertyId)) {
    return Response.json(
      { error: 'propertyId must be a lowercase id slug [a-z0-9_-], 1-64 chars', field: 'propertyId' },
      { status: 400 },
    );
  }

  return Response.json({
    rooms: await listRooms(getAdminAuth(), getAdminDatabase(), propertyId),
  });
}
