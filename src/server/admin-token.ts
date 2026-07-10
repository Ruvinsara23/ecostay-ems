export type AdminAuthResult =
  | { ok: true; uid: string }
  | { ok: false; status: 401 | 403 | 503; message: string };

/** Minimal shape of a decoded Firebase ID token we rely on. */
export type DecodedToken = { uid: string; role?: unknown };

function firebaseErrorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function isInvalidTokenErrorCode(code: string | null): boolean {
  return (
    code === 'auth/argument-error' ||
    code === 'auth/invalid-id-token' ||
    code === 'auth/id-token-expired' ||
    code === 'auth/id-token-revoked'
  );
}

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
  } catch (error) {
    const code = firebaseErrorCode(error);
    if (isInvalidTokenErrorCode(code)) {
      return { ok: false, status: 401, message: 'Invalid or expired token' };
    }
    console.error('Admin token verification unavailable');
    return {
      ok: false,
      status: 503,
      message: 'Admin service unavailable. Check the server credential configuration.',
    };
  }
  if (decoded.role !== 'admin') {
    return { ok: false, status: 403, message: 'Admin role required' };
  }
  return { ok: true, uid: decoded.uid };
}
