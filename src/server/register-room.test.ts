import { describe, expect, it } from 'vitest';
import { validateRegistration } from './register-room';

describe('validateRegistration', () => {
  it('accepts a valid registration and trims names', () => {
    expect(
      validateRegistration({
        propertyId: 'property_002',
        roomId: 'room_003',
        roomName: '  Garden Room  ',
        propertyName: ' Lagoon Villa ',
      }),
    ).toEqual({
      ok: true,
      value: {
        propertyId: 'property_002',
        roomId: 'room_003',
        roomName: 'Garden Room',
        propertyName: 'Lagoon Villa',
      },
    });
  });

  it('omits propertyName when absent or blank', () => {
    const r1 = validateRegistration({ propertyId: 'p1', roomId: 'r1', roomName: 'Room' });
    const r2 = validateRegistration({ propertyId: 'p1', roomId: 'r1', roomName: 'Room', propertyName: '   ' });
    expect(r1.ok && r1.value.propertyName).toBeUndefined();
    expect(r2.ok && r2.value.propertyName).toBeUndefined();
  });

  it.each([
    ['not an object', 42],
    ['null', null],
    ['uppercase propertyId', { propertyId: 'Property_001', roomId: 'r1', roomName: 'x' }],
    ['spaced propertyId', { propertyId: 'property 001', roomId: 'r1', roomName: 'x' }],
    ['uppercase roomId', { propertyId: 'p1', roomId: 'ROOM', roomName: 'x' }],
    ['empty roomName', { propertyId: 'p1', roomId: 'r1', roomName: '   ' }],
    ['too-long roomName', { propertyId: 'p1', roomId: 'r1', roomName: 'x'.repeat(81) }],
    ['non-string propertyName', { propertyId: 'p1', roomId: 'r1', roomName: 'x', propertyName: 5 }],
    ['missing roomName', { propertyId: 'p1', roomId: 'r1' }],
  ])('rejects %s', (_label, input) => {
    const r = validateRegistration(input);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBeTruthy();
  });
});
