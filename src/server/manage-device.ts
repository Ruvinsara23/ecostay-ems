export type DeviceAccountInput = { propertyId: string; roomId: string };

export type DeviceAccountClaims = {
  role: 'device';
  propertyId: string;
  roomId: string;
};

export type DeviceCredential = {
  uid: string;
  email: string;
  password: string;
};

export type ManageDeviceError = { field: string; message: string };
type Validation<T> = { ok: true; value: T } | { ok: false; error: ManageDeviceError };

const ID_RE = /^[a-z0-9_-]{1,64}$/;
const DEVICE_EMAIL_DOMAIN = 'devices.ecostay.local';

function err<T>(field: string, message: string): Validation<T> {
  return { ok: false, error: { field, message } };
}

function asObject(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
}

/** Validate the room scope for a Device account. Pure before it touches Auth/RTDB. */
export function validateDeviceAccountInput(raw: unknown): Validation<DeviceAccountInput> {
  const b = asObject(raw);
  if (!b) return err('body', 'expected a JSON object');

  if (typeof b.propertyId !== 'string' || !ID_RE.test(b.propertyId)) {
    return err('propertyId', 'must be a lowercase id slug [a-z0-9_-], 1-64 chars');
  }
  if (typeof b.roomId !== 'string' || !ID_RE.test(b.roomId)) {
    return err('roomId', 'must be a lowercase id slug [a-z0-9_-], 1-64 chars');
  }
  return { ok: true, value: { propertyId: b.propertyId, roomId: b.roomId } };
}

export function deviceEmailForRoom({ propertyId, roomId }: DeviceAccountInput): string {
  return `device+${propertyId}+${roomId}@${DEVICE_EMAIL_DOMAIN}`;
}

export function deviceAccountClaims(input: DeviceAccountInput): DeviceAccountClaims {
  return { role: 'device', propertyId: input.propertyId, roomId: input.roomId };
}
