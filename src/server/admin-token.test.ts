import { describe, expect, it, vi } from 'vitest';
import { authorizeAdmin } from './admin-token';

const asAdmin = async () => ({ uid: 'u-admin', role: 'admin' });
const asOwner = async () => ({ uid: 'u-owner', role: 'owner' });
const rejectsService = async () => {
  throw new Error('sensitive credential path');
};
function rejectsWithCode(code: string, message = 'sensitive error detail') {
  return async () => {
    const error = new Error(message) as Error & { code?: string };
    error.code = code;
    throw error;
  };
}

describe('authorizeAdmin', () => {
  it('accepts a valid admin token', async () => {
    expect(await authorizeAdmin('Bearer good', asAdmin)).toEqual({ ok: true, uid: 'u-admin' });
  });

  it('rejects a non-admin with 403', async () => {
    expect(await authorizeAdmin('Bearer good', asOwner)).toMatchObject({ ok: false, status: 403 });
  });

  it('rejects a missing or non-bearer header with 401', async () => {
    expect(await authorizeAdmin(null, asAdmin)).toMatchObject({ ok: false, status: 401 });
    expect(await authorizeAdmin('Basic x', asAdmin)).toMatchObject({ ok: false, status: 401 });
    expect(await authorizeAdmin('Bearer ', asAdmin)).toMatchObject({ ok: false, status: 401 });
  });

  it('rejects an unverifiable token with 401', async () => {
    expect(await authorizeAdmin('Bearer bad', rejectsWithCode('auth/id-token-expired'))).toEqual({
      ok: false,
      status: 401,
      message: 'Invalid or expired token',
    });
  });

  it('treats Admin SDK credential errors as a safe 503', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(
        await authorizeAdmin(
          'Bearer good',
          rejectsWithCode('auth/invalid-credential', 'C:/sensitive/service-account.json'),
        ),
      ).toEqual({
        ok: false,
        status: 503,
        message: 'Admin service unavailable. Check the server credential configuration.',
      });
      expect(errorLog).toHaveBeenCalledWith('Admin token verification unavailable');
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('invalid-credential');
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('service-account');
    } finally {
      errorLog.mockRestore();
    }
  });

  it('reports an unavailable Admin SDK with a safe 503 and no sensitive log detail', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      expect(await authorizeAdmin('Bearer good', rejectsService)).toEqual({
        ok: false,
        status: 503,
        message: 'Admin service unavailable. Check the server credential configuration.',
      });
      expect(errorLog).toHaveBeenCalledWith('Admin token verification unavailable');
      expect(JSON.stringify(errorLog.mock.calls)).not.toContain('sensitive credential path');
    } finally {
      errorLog.mockRestore();
    }
  });
});
