import { describe, expect, it } from 'vitest';
import type { RoomLatest } from './room-data-source';
import { FakeRoomDataSource } from './fake-room-data-source';

const SNAPSHOT: RoomLatest = {
  temperature: 27.5,
  humidity: 62,
  occupancyState: 'OCCUPIED_ACTIVE',
  updatedAt: 1_751_600_000_000,
};

describe('FakeRoomDataSource', () => {
  it('reports null immediately for a room that has never reported', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<RoomLatest | null> = [];
    source.subscribeLatest('property_001', 'room_001', (latest) => emissions.push(latest));
    expect(emissions).toEqual([null]);
  });

  it('reports the current snapshot immediately on subscribe', () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', SNAPSHOT);
    const emissions: Array<RoomLatest | null> = [];
    source.subscribeLatest('property_001', 'room_001', (latest) => emissions.push(latest));
    expect(emissions).toEqual([SNAPSHOT]);
  });

  it('pushes every new snapshot to subscribers', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<RoomLatest | null> = [];
    source.subscribeLatest('property_001', 'room_001', (latest) => emissions.push(latest));

    source.emitLatest('property_001', 'room_001', SNAPSHOT);
    source.emitLatest('property_001', 'room_001', { ...SNAPSHOT, temperature: 28.1 });

    expect(emissions).toHaveLength(3); // initial null + two updates
    expect(emissions[2]?.temperature).toBe(28.1);
  });

  it('stops notifying after unsubscribe', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<RoomLatest | null> = [];
    const unsubscribe = source.subscribeLatest('property_001', 'room_001', (latest) =>
      emissions.push(latest),
    );
    unsubscribe();
    source.emitLatest('property_001', 'room_001', SNAPSHOT);
    expect(emissions).toEqual([null]);
  });

  it('keeps rooms isolated from each other', () => {
    const source = new FakeRoomDataSource();
    const emissions: Array<RoomLatest | null> = [];
    source.subscribeLatest('property_001', 'room_001', (latest) => emissions.push(latest));
    source.emitLatest('property_001', 'room_002', SNAPSHOT);
    expect(emissions).toEqual([null]);
  });
});
