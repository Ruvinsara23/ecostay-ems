import type { RoomDataSource, RoomLatest } from './room-data-source';

type Listener = (latest: RoomLatest | null) => void;

/** In-memory RoomDataSource for tests; the seeder for UI behavior. */
export class FakeRoomDataSource implements RoomDataSource {
  private snapshots = new Map<string, RoomLatest>();
  private listeners = new Map<string, Set<Listener>>();

  emitLatest(propertyId: string, roomId: string, latest: RoomLatest): void {
    const key = `${propertyId}/${roomId}`;
    this.snapshots.set(key, latest);
    this.listeners.get(key)?.forEach((listener) => listener(latest));
  }

  subscribeLatest(
    propertyId: string,
    roomId: string,
    callback: Listener,
  ): () => void {
    const key = `${propertyId}/${roomId}`;
    const forKey = this.listeners.get(key) ?? new Set<Listener>();
    forKey.add(callback);
    this.listeners.set(key, forKey);
    callback(this.snapshots.get(key) ?? null);
    return () => {
      forKey.delete(callback);
    };
  }
}
