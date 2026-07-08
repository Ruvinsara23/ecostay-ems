import { describe, expect, it } from 'vitest';
import { authorizeAdmin } from './admin-token';

const asAdmin = async () => ({ uid: 'u-admin', role: 'admin' });
const asOwner = async () => ({ uid: 'u-owner', role: 'owner' });
const rejects = async () => {
  throw new Error('invalid');
};

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
    expect(await authorizeAdmin('Bearer bad', rejects)).toMatchObject({ ok: false, status: 401 });
  });
});
