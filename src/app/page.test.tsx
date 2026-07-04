import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
import Page from '@/app/page';

const routerMock = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/',
}));

function renderPage(
  gateway: FakeAuthGateway,
  source: FakeRoomDataSource = new FakeRoomDataSource(),
) {
  return render(
    <AuthProvider gateway={gateway}>
      <RoomDataSourceProvider source={source}>
        <Page />
      </RoomDataSourceProvider>
    </AuthProvider>,
  );
}

describe('dashboard landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows who is signed in', () => {
    renderPage(
      new FakeAuthGateway({
        initialSession: {
          uid: 'fake-uid-owner@ecostay.test',
          email: 'owner@ecostay.test',
          role: 'owner',
        },
      }),
    );
    expect(screen.getByText(/signed in as owner@ecostay\.test/i)).toBeInTheDocument();
  });

  it('signs out and lands back on login', async () => {
    const user = userEvent.setup();
    renderPage(
      new FakeAuthGateway({
        initialSession: {
          uid: 'fake-uid-owner@ecostay.test',
          email: 'owner@ecostay.test',
          role: 'owner',
        },
      }),
    );

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith('/login?next=%2F'),
    );
    expect(
      screen.queryByText(/signed in as owner@ecostay\.test/i),
    ).not.toBeInTheDocument();
  });

  it('never renders dashboard content for a signed-out visitor', async () => {
    renderPage(new FakeAuthGateway());
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalled());
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

});

const OWNER_SESSION = {
  uid: 'fake-uid-owner@ecostay.test',
  email: 'owner@ecostay.test',
  role: 'owner',
} as const;

describe('dashboard tenancy', () => {
  it('lands an owner with one room directly on its live view, by name', async () => {
    const source = new FakeRoomDataSource();
    source.setAccessibleRooms([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        propertyName: 'EcoStay Property',
        roomName: 'Room 1',
      },
    ]);
    source.emitLatest('property_001', 'room_001', {
      occupancyState: 'OCCUPIED_ACTIVE',
      temperature: 27.5,
      humidity: 62,
      updatedAt: 1_751_600_000_000,
    });
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }), source);

    expect(await screen.findByText('Room 1')).toBeInTheDocument();
    expect(screen.getByText('EcoStay Property')).toBeInTheDocument();
    expect(screen.getByText('27.5 °C')).toBeInTheDocument();
    expect(screen.getByText('Occupied')).toBeInTheDocument();
  });

  it('falls back to raw IDs when names are not set', async () => {
    const source = new FakeRoomDataSource();
    source.setAccessibleRooms([{ propertyId: 'property_001', roomId: 'room_001' }]);
    source.emitLatest('property_001', 'room_001', {
      occupancyState: 'VACANT',
      updatedAt: 1_751_600_000_000,
    });
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }), source);

    expect(await screen.findByText('room_001')).toBeInTheDocument();
    expect(screen.getByText('property_001')).toBeInTheDocument();
  });

  it('explains when no property is assigned instead of a blank screen', async () => {
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }));
    expect(await screen.findByText(/no property assigned/i)).toBeInTheDocument();
    expect(screen.getByText(/contact your administrator/i)).toBeInTheDocument();
  });

  it('lists multiple rooms and opens the picked one', async () => {
    const user = userEvent.setup();
    const source = new FakeRoomDataSource();
    source.setAccessibleRooms([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        propertyName: 'EcoStay Property',
        roomName: 'Room 1',
      },
      {
        propertyId: 'property_002',
        roomId: 'room_001',
        propertyName: 'Lagoon Villa',
        roomName: 'Garden Room',
      },
    ]);
    source.emitLatest('property_002', 'room_001', {
      occupancyState: 'VACANT',
      temperature: 24.5,
      updatedAt: 1_751_600_000_000,
    });
    renderPage(
      new FakeAuthGateway({
        initialSession: { uid: 'fake-uid-admin', email: 'admin@ecostay.test', role: 'admin' },
      }),
      source,
    );

    await user.click(await screen.findByRole('button', { name: /garden room/i }));
    expect(screen.getByText('24.5 °C')).toBeInTheDocument();
    expect(screen.getByText('Vacant')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /all rooms/i }));
    expect(await screen.findByRole('button', { name: /room 1/i })).toBeInTheDocument();
  });
});
