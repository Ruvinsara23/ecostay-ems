import { describe, expect, it } from 'vitest';
import { isCronAuthorized } from './cron-auth';

describe('isCronAuthorized', () => {
  it('accepts the exact bearer token', () => {
    expect(isCronAuthorized('Bearer s3cret', 's3cret')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(isCronAuthorized('Bearer wrong', 's3cret')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isCronAuthorized(null, 's3cret')).toBe(false);
  });

  it('rejects a non-bearer scheme', () => {
    expect(isCronAuthorized('Basic s3cret', 's3cret')).toBe(false);
  });

  it('rejects everything when the secret is not configured — even an empty match', () => {
    expect(isCronAuthorized('Bearer ', undefined)).toBe(false);
    expect(isCronAuthorized('Bearer undefined', undefined)).toBe(false);
    expect(isCronAuthorized(null, undefined)).toBe(false);
  });

  it('rejects an empty configured secret outright', () => {
    expect(isCronAuthorized('Bearer ', '')).toBe(false);
  });
});
