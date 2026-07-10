import type { Auth } from 'firebase-admin/auth';
import type { Database } from 'firebase-admin/database';
import { deviceEmailForRoom } from './manage-device';

export type AdminPropertySummary = {
  propertyId: string;
  name: string | null;
  roomCount: number;
  ownerCount: number;
};

export type AdminRoomSummary = {
  roomId: string;
  roomName: string | null;
  deviceAccountEmail: string | null;
  lastSeenAt: number | null;
};

/**
 * Browse layer for the admin console (admin-console-v2): SNAPSHOT reads via the
 * Admin SDK, keyed off `ops/roomIndex` — the same registry every server workload
 * uses (admin-deps.ts). A property only exists via room registration, so the
 * index is authoritative. N+1 reads are fine at this project's scale (see PRD).
 */
export async function listProperties(db: Database): Promise<AdminPropertySummary[]> {
  const index = (await db.ref('ops/roomIndex').get()).val() as Record<
    string,
    Record<string, true>
  > | null;
  const properties: AdminPropertySummary[] = [];
  for (const propertyId of Object.keys(index ?? {}).sort()) {
    const name = (await db.ref(`properties/${propertyId}/name`).get()).val() as string | null;
    const members = (await db.ref(`properties/${propertyId}/members`).get()).val() as Record<
      string,
      string
    > | null;
    properties.push({
      propertyId,
      name,
      roomCount: Object.keys(index?.[propertyId] ?? {}).length,
      ownerCount: Object.keys(members ?? {}).length,
    });
  }
  return properties;
}

/**
 * Rooms of one property with the two facts an admin needs at a glance: does a
 * Device account exist (Auth lookup by the room's synthetic email), and when
 * did the room last report (`latest/updatedAt` — server-stamped by firmware).
 */
export async function listRooms(
  auth: Auth,
  db: Database,
  propertyId: string,
): Promise<AdminRoomSummary[]> {
  const index = (await db.ref(`ops/roomIndex/${propertyId}`).get()).val() as Record<
    string,
    true
  > | null;
  const rooms: AdminRoomSummary[] = [];
  for (const roomId of Object.keys(index ?? {}).sort()) {
    const roomName = (
      await db.ref(`properties/${propertyId}/rooms/${roomId}/name`).get()
    ).val() as string | null;
    const lastSeenAt = (
      await db.ref(`properties/${propertyId}/rooms/${roomId}/latest/updatedAt`).get()
    ).val() as number | null;
    const email = deviceEmailForRoom({ propertyId, roomId });
    const account = await auth.getUserByEmail(email).catch((error: unknown) => {
      if ((error as { code?: string }).code === 'auth/user-not-found') return null;
      throw error;
    });
    rooms.push({ roomId, roomName, deviceAccountEmail: account ? email : null, lastSeenAt });
  }
  return rooms;
}
