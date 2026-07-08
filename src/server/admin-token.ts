export type AdminAuthResult =
  | { ok: true; uid: string }
  | { ok: false; status: 401 | 403; message: string };

/** Minimal shape of a decoded Firebase ID token we rely on. */
export type DecodedToken = { uid: string; role?: unknown };

/**
 * Authorize an admin request from its Authorization header. `verifyIdToken` is
 * injected (Firebase Admin SDK in production, a fake in tests). A missing/bad
 * token → 401; a valid token without the admin claim → 403. Pure orchestration.
 */
export async function authorizeAdmin(
  authorizationHeader: string | null,
  verifyIdToken: (token: string) => Promise<DecodedToken>,
): Promise<AdminAuthResult> {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, message: 'Missing bearer token' };
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  if (!token) return { ok: false, status: 401, message: 'Missing bearer token' };

  let decoded: DecodedToken;
  try {
    decoded = await verifyIdToken(token);
  } catch {
    return { ok: false, status: 401, message: 'Invalid or expired token' };
  }
  if (decoded.role !== 'admin') {
    return { ok: false, status: 403, message: 'Admin role required' };
  }
  return { ok: true, uid: decoded.uid };
}
