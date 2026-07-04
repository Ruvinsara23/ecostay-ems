import { Database, onValue, ref } from 'firebase/database';
import type { RoomDataSource, RoomLatest } from './room-data-source';

/**
 * The real RoomDataSource over firebase/database. Reads the firmware-written
 * `latest` snapshot (docs/firmware-contract.md) — path shape is the contract's,
 * never invented here.
 */
export function createFirebaseRoomDataSource(db: Database): RoomDataSource {
  return {
    subscribeLatest(propertyId, roomId, callback) {
      const latestRef = ref(db, `properties/${propertyId}/rooms/${roomId}/latest`);
      return onValue(latestRef, (snapshot) => {
        callback(snapshot.exists() ? (snapshot.val() as RoomLatest) : null);
      });
    },
  };
}
