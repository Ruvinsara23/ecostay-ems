import { describe, expect, it } from 'vitest';
import {
  deviceAccountClaims,
  deviceEmailForRoom,
  validateDeviceAccountInput,
} from './manage-device';

describe('validateDeviceAccountInput', () => {
  it('accepts a valid room scope', () => {
    expect(validateDeviceAccountInput({ propertyId: 'property_002', roomId: 'room_003' })).toEqual({
      ok: true,
      value: { propertyId: 'property_002', roomId: 'room_003' },
    });
  });

  it.each([
    ['non-object', 42, 'body'],
    ['missing propertyId', { roomId: 'room_001' }, 'propertyId'],
    ['uppercase propertyId', { propertyId: 'Property_001', roomId: 'room_001' }, 'propertyId'],
    ['spaced roomId', { propertyId: 'property_001', roomId: 'room 001' }, 'roomId'],
    ['empty roomId', { propertyId: 'property_001', roomId: '' }, 'roomId'],
  ])('rejects %s', (_label, input, field) => {
    const result = validateDeviceAccountInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(field);
  });
});

describe('device account identity helpers', () => {
  it('derives a stable email from the room scope', () => {
    expect(deviceEmailForRoom({ propertyId: 'property_002', roomId: 'room_003' })).toBe(
      'device+property_002+room_003@devices.ecostay.local',
    );
  });

  it('creates the exact custom-claim scope expected by the rules draft', () => {
    expect(deviceAccountClaims({ propertyId: 'property_002', roomId: 'room_003' })).toEqual({
      role: 'device',
      propertyId: 'property_002',
      roomId: 'room_003',
    });
  });
});
