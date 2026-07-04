import type { Database } from 'firebase-admin/database';
import type { RoomLatest } from '@/rooms/room-data-source';
import type { SamplerDeps } from './sample-energy';

/**
 * Rooms come from `ops/roomIndex/{pid}/{rid}: true` — a tiny Admin-only registry
 * (seeder-maintained today, Admin UI later). Reading the `properties` tree instead
 * would download every room's growing history on every tick.
 */
export async function listIndexedRooms(
  db: Database,
): Promise<Array<{ propertyId: string; roomId: string }>> {
  const index = (await db.ref('ops/roomIndex').get()).val() as Record<
    string,
    Record<string, true>
  > | null;
  const rooms: Array<{ propertyId: string; roomId: string }> = [];
  for (const propertyId of Object.keys(index ?? {}).sort()) {
    for (const roomId of Object.keys(index?.[propertyId] ?? {}).sort()) {
      rooms.push({ propertyId, roomId });
    }
  }
  return rooms;
}

export function createSamplerDeps(db: Database): SamplerDeps {
  return {
    listRooms: () => listIndexedRooms(db),

    async readLatest(propertyId, roomId) {
      const snapshot = await db
        .ref(`properties/${propertyId}/rooms/${roomId}/latest`)
        .get();
      return (snapshot.val() as RoomLatest | null) ?? null;
    },

    async appendEnergySample(propertyId, roomId, sample) {
      await db.ref(`properties/${propertyId}/energyHistory/${roomId}`).push(sample);
    },
  };
}
