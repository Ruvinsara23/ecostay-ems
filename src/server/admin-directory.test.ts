import { describe, expect, it } from 'vitest';
import { fleetStatus, listProperties, listRooms } from './admin-directory';

function makeDb(data: Record<string, unknown>) {
  return {
    ref(path = '') {
      return {
        async get() {
          return { val: () => (path in data ? data[path] : null) };
        },
      };
    },
  };
}

function makeAuth(deviceEmails: string[]) {
  return {
    async getUserByEmail(email: string) {
      if (deviceEmails.includes(email)) return { uid: `uid-${email}`, email };
      const error = new Error('missing') as Error & { code?: string };
      error.code = 'auth/user-not-found';
      throw error;
    },
  };
}

describe('listProperties', () => {
  it('lists every indexed property with its name and room/owner counts', async () => {
    const db = makeDb({
      'ops/roomIndex': {
        property_001: { room_001: true, room_002: true },
        property_002: { room_001: true },
      },
      'properties/property_001/name': 'EcoStay Villa',
      'properties/property_001/members': { uid_a: 'owner', uid_b: 'owner' },
    });

    expect(await listProperties(db as never)).toEqual([
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 2, ownerCount: 2 },
      { propertyId: 'property_002', name: null, roomCount: 1, ownerCount: 0 },
    ]);
  });

  it('returns an empty list when nothing is registered', async () => {
    expect(await listProperties(makeDb({}) as never)).toEqual([]);
  });
});

describe('listRooms', () => {
  it('lists rooms with names, device-account presence, and last-seen time', async () => {
    const db = makeDb({
      'ops/roomIndex/property_001': { room_001: true, room_002: true },
      'properties/property_001/rooms/room_001/name': 'Garden Room',
      'properties/property_001/rooms/room_001/latest/updatedAt': 1_752_000_000_000,
    });
    const auth = makeAuth(['device+property_001+room_001@devices.ecostay.local']);

    expect(await listRooms(auth as never, db as never, 'property_001')).toEqual([
      {
        roomId: 'room_001',
        roomName: 'Garden Room',
        deviceAccountEmail: 'device+property_001+room_001@devices.ecostay.local',
        lastSeenAt: 1_752_000_000_000,
      },
      { roomId: 'room_002', roomName: null, deviceAccountEmail: null, lastSeenAt: null },
    ]);
  });

  it('returns an empty list for an unknown property', async () => {
    expect(await listRooms(makeAuth([]) as never, makeDb({}) as never, 'property_404')).toEqual(
      [],
    );
  });
});

describe('fleetStatus', () => {
  const NOW = 1_752_000_000_000;

  it('counts reporting rooms per the 15 s freshness rule and flattens open alerts', async () => {
    const db = makeDb({
      'ops/roomIndex': {
        property_001: { room_001: true, room_002: true },
        property_002: { room_001: true },
      },
      'properties/property_001/name': 'EcoStay Villa',
      // room_001 wrote 3 s ago (reporting); room_002 went silent 60 s ago (not).
      'properties/property_001/rooms/room_001/latest/updatedAt': NOW - 3_000,
      'properties/property_001/rooms/room_002/latest/updatedAt': NOW - 60_000,
      'ops/openAlerts/property_001': {
        room_002: { 'device-offline': 'alert_1', gas: 'alert_2' },
      },
      // property_002's room has never written latest → not reporting, no alerts.
    });

    expect(await fleetStatus(db as never, NOW)).toEqual([
      {
        propertyId: 'property_001',
        name: 'EcoStay Villa',
        roomCount: 2,
        roomsReporting: 1,
        openAlerts: [
          { roomId: 'room_002', type: 'device-offline' },
          { roomId: 'room_002', type: 'gas' },
        ],
      },
      {
        propertyId: 'property_002',
        name: null,
        roomCount: 1,
        roomsReporting: 0,
        openAlerts: [],
      },
    ]);
  });

  it('returns an empty list when nothing is registered', async () => {
    expect(await fleetStatus(makeDb({}) as never, NOW)).toEqual([]);
  });
});
