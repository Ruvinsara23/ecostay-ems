import {
  OwnerOperationError,
  assignOwnerToProperty,
  createOwner,
  listOwners,
  removeOwnerFromProperty,
  resetOwnerPassword,
  setOwnerDisabled,
} from '@/server/admin-owners';
import { getAdminAuth, getAdminDatabase } from '@/server/admin-app';
import { authorizeAdmin } from '@/server/admin-token';
import type { ManageOwnerError } from '@/server/manage-owner';
import {
  validateCreateOwner,
  validateMembership,
  validateResetPassword,
  validateSetDisabled,
} from '@/server/manage-owner';

// firebase-admin needs the Node runtime — never edge.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(request: Request) {
  return authorizeAdmin(request.headers.get('authorization'), (token) =>
    getAdminAuth().verifyIdToken(token),
  );
}

function badRequest(error: ManageOwnerError) {
  return Response.json({ error: error.message, field: error.field }, { status: 400 });
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (!auth.ok) return Response.json({ error: auth.message }, { status: auth.status });
  const owners = await listOwners(getAdminAuth(), getAdminDatabase());
  return Response.json({ owners });
}

/**
 * Owner-account management (risk gate #1). A single admin-guarded POST dispatches on
 * `action`; all provisioning goes through the Admin SDK so client rules stay closed.
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

  try {
    if (action === 'create') {
      const parsed = validateCreateOwner(body);
      if (!parsed.ok) return badRequest(parsed.error);
      return Response.json(await createOwner(getAdminAuth(), getAdminDatabase(), parsed.value));
    }
    if (action === 'setDisabled') {
      const parsed = validateSetDisabled(body);
      if (!parsed.ok) return badRequest(parsed.error);
      await setOwnerDisabled(getAdminAuth(), parsed.value);
      return Response.json({ ok: true });
    }
    if (action === 'resetPassword') {
      const parsed = validateResetPassword(body);
      if (!parsed.ok) return badRequest(parsed.error);
      return Response.json(await resetOwnerPassword(getAdminAuth(), parsed.value));
    }
    if (action === 'assign') {
      const parsed = validateMembership(body);
      if (!parsed.ok) return badRequest(parsed.error);
      await assignOwnerToProperty(getAdminAuth(), getAdminDatabase(), parsed.value);
      return Response.json({ ok: true });
    }
    if (action === 'unassign') {
      const parsed = validateMembership(body);
      if (!parsed.ok) return badRequest(parsed.error);
      await removeOwnerFromProperty(getAdminAuth(), getAdminDatabase(), parsed.value);
      return Response.json({ ok: true });
    }
    return Response.json({ error: 'unknown action' }, { status: 400 });
  } catch (error) {
    if (error instanceof OwnerOperationError) {
      return Response.json({ error: error.message, field: error.field }, { status: 400 });
    }
    throw error;
  }
}
