import { getAdminAuth, getAdminDatabase } from '@/server/admin-app';
import { applyRoomRegistration } from '@/server/admin-deps';
import { authorizeAdmin } from '@/server/admin-token';
import { validateRegistration } from '@/server/register-room';

// firebase-admin needs the Node runtime — never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin-only room registration (risk gates #1/#2). Verifies the caller's Firebase
 * ID token carries the admin claim, validates the body, then writes ops/roomIndex
 * + room metadata via the Admin SDK — so ops/** stays server-only.
 */
export async function POST(request: Request) {
  const auth = await authorizeAdmin(request.headers.get('authorization'), (token) =>
    getAdminAuth().verifyIdToken(token),
  );
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = validateRegistration(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error.message, field: parsed.error.field }, { status: 400 });
  }

  await applyRoomRegistration(getAdminDatabase(), parsed.value);
  return Response.json({ ok: true });
}
