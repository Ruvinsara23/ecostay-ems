import type { Session } from '@/auth/auth-gateway';
import type { RoomTelemetry } from '@/telemetry/contract';

/** One room an authenticated user may see, with display names when set (Admin metadata). */
export type RoomRef = {
  propertyId: string;
  roomId: string;
  propertyName?: string;
  roomName?: string;
};

/**
 * A room's `latest` snapshot as it actually arrives from RTDB: the firmware
 * writes every field, but the database is untyped at runtime, so consumers
 * must tolerate any single field being absent (PRD: one bad field must never
 * blank the view). `null` means the room has never reported at all.
 */
export type RoomLatest = Partial<RoomTelemetry>;

/**
 * The RTDB read seam (PRD "Implementation Decisions"). UI code depends on this
 * port only — never on the Firebase SDK directly.
 */
export interface RoomDataSource {
  /**
   * The rooms this session may see (tenancy, ADR-0005): owners get the rooms of
   * their member properties (via the users/{uid}/properties index); admins get
   * every property's rooms. Client-side courtesy — RTDB rules are the boundary.
   */
  listAccessibleRooms(session: Session): Promise<RoomRef[]>;

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

  /**
   * Milliseconds to ADD to the local clock to get server time (RTDB
   * `.info/serverTimeOffset`). Freshness must be judged on the corrected clock —
   * a real ~25-min dev-machine skew was measured in the field (issue 04).
   */
  subscribeServerTimeOffset(callback: (offsetMs: number) => void): () => void;
}
