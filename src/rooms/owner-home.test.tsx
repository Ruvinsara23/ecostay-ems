import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRoomDataSource } from './fake-room-data-source';
import { RoomDataSourceProvider } from './room-data-source-context';
import { OwnerHome } from './owner-home';
import type { RoomRef } from './room-data-source';

const ROOMS: RoomRef[] = [
  { propertyId: 'property_001', roomId: 'room_001', propertyName: 'EcoStay Villa', roomName: 'Garden Room' },
  { propertyId: 'property_001', roomId: 'room_002', propertyName: 'EcoStay Villa', roomName: 'Ocean Room' },
  { propertyId: 'property_002', roomId: 'room_001', propertyName: 'Lagoon House', roomName: 'Cabin' },
];

function renderHome(source: FakeRoomDataSource, onOpenRoom = vi.fn()) {
  render(
    <RoomDataSourceProvider source={source}>
      <OwnerHome rooms={ROOMS} onOpenRoom={onOpenRoom} />
    </RoomDataSourceProvider>,
  );
  return onOpenRoom;
}

describe('OwnerHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('groups rooms by property with a fleet stat strip', async () => {
    const source = new FakeRoomDataSource();
    // Two fresh (online), one stale (offline).
    source.emitLatest('property_001', 'room_001', {
      occupancyState: 'OCCUPIED_ACTIVE', temperature: 28, power: 42, updatedAt: Date.now(),
    });
    source.emitLatest('property_001', 'room_002', {
      occupancyState: 'VACANT', temperature: 26, power: 5, updatedAt: Date.now(),
    });
    source.emitLatest('property_002', 'room_001', {
      occupancyState: 'VACANT', temperature: 27, power: 8, updatedAt: 1_000_000,
    });
    renderHome(source);

    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
    expect(screen.getByText('Lagoon House')).toBeInTheDocument();
    // Stat strip: 2 properties, 2 of 3 rooms reporting.
    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('2/3')).toBeInTheDocument();
    // Occupancy for a fresh room; offline honesty for the stale one.
    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(screen.getByText(/offline/i)).toBeInTheDocument();
  });

  it('badges a room that has an open alert', async () => {
    const source = new FakeRoomDataSource();
    source.emitLatest('property_001', 'room_001', {
      occupancyState: 'VACANT', temperature: 28, power: 42, updatedAt: Date.now(),
    });
    source.emitAlerts('property_001', [
      { id: 'a1', roomId: 'room_001', type: 'gas', severity: 'critical', value: 120, startedAt: Date.now() },
    ]);
    renderHome(source);

    expect(await screen.findByText(/1 alert/i)).toBeInTheDocument();
  });

  it('opens a room when its card is clicked', async () => {
    const user = userEvent.setup();
    const source = new FakeRoomDataSource();
    source.emitLatest('property_002', 'room_001', {
      occupancyState: 'VACANT', temperature: 27, power: 8, updatedAt: Date.now(),
    });
    const onOpenRoom = renderHome(source);

    await user.click(await screen.findByRole('button', { name: /cabin/i }));
    expect(onOpenRoom).toHaveBeenCalledWith(ROOMS[2]);
  });

  it('is honest about a room that has never reported', async () => {
    const source = new FakeRoomDataSource();
    renderHome(source);
    // No latest for any room → all never reported.
    expect((await screen.findAllByText(/never reported/i)).length).toBe(3);
  });
});
