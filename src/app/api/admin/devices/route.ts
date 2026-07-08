import { createDeviceAccount, DeviceAccountError, resetDeviceCredential } from '@/server/admin-devices';
import { getAdminAuth, getAdminDatabase } from '@/server/admin-app';
import { authorizeAdmin } from '@/server/admin-token';
import type { ManageDeviceError } from '@/server/manage-device';
import { validateDeviceAccountInput } from '@/server/manage-device';

// firebase-admin needs the Node runtime - never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(request: Request) {
  return authorizeAdmin(request.headers.get('authorization'), (token) =>
    getAdminAuth().verifyIdToken(token),
  );
}

function badRequest(error: ManageDeviceError) {
  return Response.json({ error: error.message, field: error.field }, { status: 400 });
}

/**
 * Device-account management for ADR-0007 slice 01. It creates/resets Firebase Auth
 * credentials and custom claims only; no Device credential is written to RTDB.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = (body as { action?: unknown } | null)?.action;
  const parsed = validateDeviceAccountInput(body);
  if (!parsed.ok) return badRequest(parsed.error);

  try {
    if (action === 'create') {
      return Response.json(
        await createDeviceAccount(getAdminAuth(), getAdminDatabase(), parsed.value),
      );
    }
    if (action === 'resetPassword') {
      return Response.json(
        await resetDeviceCredential(getAdminAuth(), getAdminDatabase(), parsed.value),
      );
    }
    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof DeviceAccountError) {
      return Response.json({ error: error.message, field: error.field }, { status: 400 });
    }
    throw error;
  }
}
