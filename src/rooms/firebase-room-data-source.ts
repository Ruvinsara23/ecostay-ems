import { Database, get, onValue, ref } from 'firebase/database';
import type { RoomDataSource, RoomLatest, RoomRef } from './room-data-source';

type PropertyNode = {
  name?: string;
  rooms?: Record<string, { name?: string }>;
};

function roomsOf(propertyId: string, property: PropertyNode | null): RoomRef[] {
  if (!property?.rooms) return [];
  return Object.keys(property.rooms)
    .sort()
    .map((roomId) => ({
      propertyId,
      roomId,
      propertyName: property.name,
      roomName: property.rooms?.[roomId]?.name,
    }));
}

/**
 * The real RoomDataSource over firebase/database. Reads the firmware-written
 * `latest` snapshot (docs/firmware-contract.md) — path shape is the contract's,
 * never invented here.
 */
export function createFirebaseRoomDataSource(db: Database): RoomDataSource {
  return {
    async listAccessibleRooms(session) {
      if (session.role === 'admin') {
        const all = (await get(ref(db, 'properties'))).val() as Record<
          string,
          PropertyNode
        > | null;
        return Object.keys(all ?? {})
          .sort()
          .flatMap((propertyId) => roomsOf(propertyId, all?.[propertyId] ?? null));
      }
      const index = (await get(ref(db, `users/${session.uid}/properties`))).val() as Record<
        string,
        true
      > | null;
      const propertyIds = Object.keys(index ?? {}).sort();
      const nodes = await Promise.all(
        propertyIds.map(
          async (propertyId) =>
            (await get(ref(db, `properties/${propertyId}`))).val() as PropertyNode | null,
        ),
      );
      return propertyIds.flatMap((propertyId, i) => roomsOf(propertyId, nodes[i]));
    },

    subscribeLatest(propertyId, roomId, callback) {
      const latestRef = ref(db, `properties/${propertyId}/rooms/${roomId}/latest`);
      return onValue(latestRef, (snapshot) => {
        callback(snapshot.exists() ? (snapshot.val() as RoomLatest) : null);
      });
    },
  };
}
