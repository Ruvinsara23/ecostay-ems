import { describe, expect, it } from 'vitest';
import {
  validateCreateOwner,
  validateMembership,
  validateResetPassword,
  validateSetDisabled,
} from './manage-owner';

describe('validateCreateOwner', () => {
  it('accepts a valid create request and trims the email', () => {
    const result = validateCreateOwner({
      email: '  Owner@Example.com ',
      password: 'super-secret',
      propertyId: 'property_002',
    });
    expect(result).toEqual({
      ok: true,
      value: { email: 'owner@example.com', password: 'super-secret', propertyId: 'property_002' },
    });
  });

  it.each([
    ['non-object', 42, 'body'],
    ['null', null, 'body'],
    ['missing email', { password: 'super-secret', propertyId: 'property_002' }, 'email'],
    ['bad email', { email: 'not-an-email', password: 'super-secret', propertyId: 'p1' }, 'email'],
    ['short password', { email: 'a@b.co', password: 'short', propertyId: 'p1' }, 'password'],
    ['non-string password', { email: 'a@b.co', password: 123, propertyId: 'p1' }, 'password'],
    ['bad propertyId', { email: 'a@b.co', password: 'super-secret', propertyId: 'BAD ID' }, 'propertyId'],
  ])('rejects %s', (_label, input, field) => {
    const result = validateCreateOwner(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(field);
  });
});

describe('validateSetDisabled', () => {
  it('accepts a valid uid + boolean', () => {
    expect(validateSetDisabled({ uid: 'abc123XYZ', disabled: true })).toEqual({
      ok: true,
      value: { uid: 'abc123XYZ', disabled: true },
    });
  });

  it.each([
    ['missing uid', { disabled: true }, 'uid'],
    ['uid with path chars', { uid: 'a/b', disabled: true }, 'uid'],
    ['non-boolean disabled', { uid: 'abc', disabled: 'yes' }, 'disabled'],
  ])('rejects %s', (_label, input, field) => {
    const result = validateSetDisabled(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(field);
  });
});

describe('validateResetPassword', () => {
  it('accepts and normalizes an email', () => {
    expect(validateResetPassword({ email: ' Owner@Example.com ' })).toEqual({
      ok: true,
      value: { email: 'owner@example.com' },
    });
  });

  it('rejects a malformed email', () => {
    const result = validateResetPassword({ email: 'nope' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('email');
  });
});

describe('validateMembership (slice 06 assign/remove)', () => {
  it('accepts a valid uid + propertyId', () => {
    const result = validateMembership({ uid: 'Abc123_-x', propertyId: 'property_001' });
    expect(result).toEqual({
      ok: true,
      value: { uid: 'Abc123_-x', propertyId: 'property_001' },
    });
  });

  it('rejects a path-hostile uid', () => {
    const result = validateMembership({ uid: 'a/b', propertyId: 'property_001' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe('uid');
  });

  it('rejects a malformed propertyId and a non-object body', () => {
    const bad = validateMembership({ uid: 'abc', propertyId: 'NOPE UPPER' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.field).toBe('propertyId');
    expect(validateMembership(null).ok).toBe(false);
  });
});
