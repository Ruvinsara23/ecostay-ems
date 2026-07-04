import { describe, expect, it } from 'vitest';
import type { RoomLatest } from '@/rooms/room-data-source';
import { EnergySample, sampleEnergy, SamplerDeps } from './sample-energy';

const NOW = 2_000_000_000_000;

function makeDeps(rooms: Record<string, RoomLatest | null>): {
  deps: SamplerDeps;
  written: Array<{ propertyId: string; roomId: string; sample: EnergySample }>;
} {
  const written: Array<{ propertyId: string; roomId: string; sample: EnergySample }> = [];
  const deps: SamplerDeps = {
    async listRooms() {
      return Object.keys(rooms).map((key) => {
        const [propertyId, roomId] = key.split('/');
        return { propertyId, roomId };
      });
    },
    async readLatest(propertyId, roomId) {
      return rooms[`${propertyId}/${roomId}`] ?? null;
    },
    async appendEnergySample(propertyId, roomId, sample) {
      written.push({ propertyId, roomId, sample });
    },
  };
  return { deps, written };
}

describe('sampleEnergy', () => {
  it('samples a fresh room verbatim, stamped with now', async () => {
    const { deps, written } = makeDeps({
      'property_001/room_001': {
        energy: 1.234,
        power: 4.7,
        occupancyState: 'OCCUPIED_ACTIVE',
        updatedAt: NOW - 3_000,
      },
    });

    const report = await sampleEnergy(deps, NOW);

    expect(written).toEqual([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        sample: {
          energy: 1.234,
          power: 4.7,
          occupancyState: 'OCCUPIED_ACTIVE',
          sampledAt: NOW,
        },
      },
    ]);
    expect(report).toEqual({ sampled: 1, skippedNoData: 0, skippedStale: 0 });
  });

  it('skips a room that has never reported', async () => {
    const { deps, written } = makeDeps({ 'property_001/room_001': null });
    const report = await sampleEnergy(deps, NOW);
    expect(written).toEqual([]);
    expect(report).toEqual({ sampled: 0, skippedNoData: 1, skippedStale: 0 });
  });

  it('skips a stale room (silent past 10 minutes) instead of recording frozen values', async () => {
    const { deps, written } = makeDeps({
      'property_001/room_001': { energy: 1.2, power: 4.7, updatedAt: NOW - 601_000 },
    });
    const report = await sampleEnergy(deps, NOW);
    expect(written).toEqual([]);
    expect(report).toEqual({ sampled: 0, skippedNoData: 0, skippedStale: 1 });
  });

  it('skips a snapshot missing the energy field', async () => {
    const { deps, written } = makeDeps({
      'property_001/room_001': { power: 4.7, updatedAt: NOW - 3_000 },
    });
    const report = await sampleEnergy(deps, NOW);
    expect(written).toEqual([]);
    expect(report).toEqual({ sampled: 0, skippedNoData: 1, skippedStale: 0 });
  });

  it('handles many rooms independently', async () => {
    const { deps, written } = makeDeps({
      'property_001/room_001': {
        energy: 1.2,
        power: 4.7,
        occupancyState: 'VACANT',
        updatedAt: NOW - 3_000,
      },
      'property_001/room_002': null,
      'property_002/room_001': { energy: 0.4, power: 0.6, updatedAt: NOW - 700_000 },
    });

    const report = await sampleEnergy(deps, NOW);

    expect(written).toHaveLength(1);
    expect(written[0].roomId).toBe('room_001');
    expect(report).toEqual({ sampled: 1, skippedNoData: 1, skippedStale: 1 });
  });

  it('omits occupancyState from the sample when the snapshot lacks it', async () => {
    const { deps, written } = makeDeps({
      'property_001/room_001': { energy: 1.2, power: 4.7, updatedAt: NOW - 3_000 },
    });
    await sampleEnergy(deps, NOW);
    expect(written[0].sample).toEqual({ energy: 1.2, power: 4.7, sampledAt: NOW });
  });
});
