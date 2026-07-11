export type CreateOwnerInput = { email: string; password: string; propertyId: string };
export type SetDisabledInput = { uid: string; disabled: boolean };
export type ResetPasswordInput = { email: string };
export type MembershipInput = { uid: string; propertyId: string };

export type ManageOwnerError = { field: string; message: string };
type Validation<T> = { ok: true; value: T } | { ok: false; error: ManageOwnerError };

const ID_RE = /^[a-z0-9_-]{1,64}$/;
// Firebase UIDs are opaque; keep them to safe RTDB-path chars so a uid can key a path.
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/;
// Deliberately conservative: one @, a dot in the domain, no whitespace. Firebase does
// the authoritative check; this only rejects obviously-malformed input early.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 128;

function err<T>(field: string, message: string): Validation<T> {
  return { ok: false, error: { field, message } };
}

function asObject(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
}

function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= EMAIL_MAX && EMAIL_RE.test(email) ? email : null;
}

/** Validate a create-owner request. Pure — unit-tested before it touches Auth/RTDB. */
export function validateCreateOwner(raw: unknown): Validation<CreateOwnerInput> {
  const b = asObject(raw);
  if (!b) return err('body', 'expected a JSON object');

  const email = normalizeEmail(b.email);
  if (!email) return err('email', 'must be a valid email address');
  if (typeof b.password !== 'string' || b.password.length < PASSWORD_MIN || b.password.length > PASSWORD_MAX) {
    return err('password', `must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters`);
  }
  if (typeof b.propertyId !== 'string' || !ID_RE.test(b.propertyId)) {
    return err('propertyId', 'must be a lowercase id slug [a-z0-9_-], 1–64 chars');
  }
  return { ok: true, value: { email, password: b.password, propertyId: b.propertyId } };
}

/** Validate a disable/enable request. */
export function validateSetDisabled(raw: unknown): Validation<SetDisabledInput> {
  const b = asObject(raw);
  if (!b) return err('body', 'expected a JSON object');

  if (typeof b.uid !== 'string' || !UID_RE.test(b.uid)) {
    return err('uid', 'must be a valid account id');
  }
  if (typeof b.disabled !== 'boolean') return err('disabled', 'must be a boolean');
  return { ok: true, value: { uid: b.uid, disabled: b.disabled } };
}

/** Validate an assign/remove property-access request (slice 06 member writes). */
export function validateMembership(raw: unknown): Validation<MembershipInput> {
  const b = asObject(raw);
  if (!b) return err('body', 'expected a JSON object');

  if (typeof b.uid !== 'string' || !UID_RE.test(b.uid)) {
    return err('uid', 'must be a valid account id');
  }
  if (typeof b.propertyId !== 'string' || !ID_RE.test(b.propertyId)) {
    return err('propertyId', 'must be a lowercase id slug [a-z0-9_-], 1–64 chars');
  }
  return { ok: true, value: { uid: b.uid, propertyId: b.propertyId } };
}

/** Validate a password-reset request. */
export function validateResetPassword(raw: unknown): Validation<ResetPasswordInput> {
  const b = asObject(raw);
  if (!b) return err('body', 'expected a JSON object');

  const email = normalizeEmail(b.email);
  if (!email) return err('email', 'must be a valid email address');
  return { ok: true, value: { email } };
}
