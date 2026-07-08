export type RegisterRoomInput = {
  propertyId: string;
  roomId: string;
  roomName: string;
  propertyName?: string;
};

export type RegisterRoomError = { field: string; message: string };
export type RegisterRoomValidation =
  | { ok: true; value: RegisterRoomInput }
  | { ok: false; error: RegisterRoomError };

const ID_RE = /^[a-z0-9_-]{1,64}$/;
const NAME_MAX = 80;

function err(field: string, message: string): RegisterRoomValidation {
  return { ok: false, error: { field, message } };
}

/**
 * Validate a room-registration request body (used by the Admin SDK API route).
 * IDs are lowercase slugs; names are bounded, trimmed display text. Pure so it is
 * unit-tested exhaustively before it ever touches the database.
 */
export function validateRegistration(raw: unknown): RegisterRoomValidation {
  if (typeof raw !== 'object' || raw === null) return err('body', 'expected a JSON object');
  const b = raw as Record<string, unknown>;

  if (typeof b.propertyId !== 'string' || !ID_RE.test(b.propertyId)) {
    return err('propertyId', 'must be a lowercase id slug [a-z0-9_-], 1–64 chars');
  }
  if (typeof b.roomId !== 'string' || !ID_RE.test(b.roomId)) {
    return err('roomId', 'must be a lowercase id slug [a-z0-9_-], 1–64 chars');
  }
  if (typeof b.roomName !== 'string' || b.roomName.trim() === '' || b.roomName.length > NAME_MAX) {
    return err('roomName', `required display text, up to ${NAME_MAX} chars`);
  }
  if (
    b.propertyName !== undefined &&
    (typeof b.propertyName !== 'string' || b.propertyName.length > NAME_MAX)
  ) {
    return err('propertyName', `optional display text, up to ${NAME_MAX} chars`);
  }

  const value: RegisterRoomInput = {
    propertyId: b.propertyId,
    roomId: b.roomId,
    roomName: b.roomName.trim(),
  };
  const propertyName = typeof b.propertyName === 'string' ? b.propertyName.trim() : '';
  if (propertyName) value.propertyName = propertyName;
  return { ok: true, value };
}
