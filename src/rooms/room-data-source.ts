import type { RoomTelemetry } from '@/telemetry/contract';

/**
 * A room's `latest` snapshot as it actually arrives from RTDB: the firmware
 * writes every field, but the database is untyped at runtime, so consumers
 * must tolerate any single field being absent (PRD: one bad field must never
 * blank the view). `null` means the room has never reported at all.
 */
export type RoomLatest = Partial<RoomTelemetry>;

/**
 * The RTDB read seam (PRD "Implementation Decisions"). UI code depends on this
 * port only — never on the Firebase SDK directly. Slice 03 adds the tenancy
 * read (listAccessibleRooms) to this same port.
 */
export interface RoomDataSource {
  /**
   * Reports the room's current `latest` (or null if never reported)
   * immediately-or-soon, then again on every firmware write.
   * Returns an unsubscribe function.
   */
  subscribeLatest(
    propertyId: string,
    roomId: string,
    callback: (latest: RoomLatest | null) => void,
  ): () => void;
}
