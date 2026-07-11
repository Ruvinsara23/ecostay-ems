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
    // Identity now lives on the sign-out control's accessible title.
    expect(screen.getByRole('button', { name: /sign out/i }).getAttribute('title')).toMatch(
      /owner@ecostay\.test/,
    );
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
      updatedAt: Date.now(), // fresh → online, so the occupancy status pill renders
    });
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }), source);

    expect(await screen.findByText('Room 1')).toBeInTheDocument();
    expect(screen.getByText('EcoStay Property')).toBeInTheDocument();
    expect(screen.getByText('27.5 °C')).toBeInTheDocument();
    expect(screen.getByText(/Status: Occupied/i)).toBeInTheDocument();
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
      updatedAt: Date.now(), // fresh → online, so the occupancy status pill renders
    });
    renderPage(
      new FakeAuthGateway({
        initialSession: { uid: 'fake-uid-admin', email: 'admin@ecostay.test', role: 'admin' },
      }),
      source,
    );

    await user.click(await screen.findByRole('button', { name: /garden room/i }));
    expect(screen.getByText('24.5 °C')).toBeInTheDocument();
    expect(screen.getByText(/Status: Vacant/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /home/i }));
    expect(await screen.findByRole('button', { name: /room 1/i })).toBeInTheDocument();
  });

  it('shows an error with a retry instead of an endless spinner when the room list fails', async () => {
    const user = userEvent.setup();
    const source = new FakeRoomDataSource();
    const rooms = [
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        propertyName: 'EcoStay Property',
        roomName: 'Room 1',
      },
    ];
    source.setAccessibleRooms(rooms);
    source.emitLatest('property_001', 'room_001', { occupancyState: 'VACANT' });
    let failFirstLoad = true;
    const realList = source.listAccessibleRooms.bind(source);
    source.listAccessibleRooms = async (session) => {
      if (failFirstLoad) throw new Error('rules denied');
      return realList(session);
    };
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }), source);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load your rooms/i);

    failFirstLoad = false;
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Room 1')).toBeInTheDocument();
  });

  it('allows navigating to Devices, Routines, and Activity tabs via the side rail', async () => {
    const user = userEvent.setup();
    const source = new FakeRoomDataSource();
    source.setAccessibleRooms([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        propertyName: 'EcoStay Property',
        roomName: 'Room 1',
      },
    ]);
    source.emitLatest('property_001', 'room_001', { occupancyState: 'VACANT' });
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }), source);

    // Default view is Live View
    expect(await screen.findByText(/Live 3D Room View/i)).toBeInTheDocument();

    // Navigate to Devices
    await user.click(screen.getByRole('button', { name: /Devices/i }));
    expect(await screen.findByText(/Devices View/i)).toBeInTheDocument();

    // Navigate to Routines
    await user.click(screen.getByRole('button', { name: /Routines/i }));
    expect(await screen.findByText(/Routines & Automations/i)).toBeInTheDocument();

    // Navigate to Activity
    await user.click(screen.getByRole('button', { name: /Activity/i }));
    expect(await screen.findByText(/Activity & Telemetry/i)).toBeInTheDocument();
  });
});

describe('dashboard shell cleanup (no dead controls)', () => {
  function sourceWithOneRoom() {
    const source = new FakeRoomDataSource();
    source.setAccessibleRooms([
      {
        propertyId: 'property_001',
        roomId: 'room_001',
        propertyName: 'EcoStay Property',
        roomName: 'Room 1',
      },
    ]);
    source.emitLatest('property_001', 'room_001', { occupancyState: 'VACANT' });
    return source;
  }

  it('has no dead "Add Device" button in the header', async () => {
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }), sourceWithOneRoom());
    await screen.findByText('Room 1');
    expect(screen.queryByRole('button', { name: /add device/i })).not.toBeInTheDocument();
  });

  it('titles the header per tab instead of always saying Live 3D Room View (S2)', async () => {
    const user = userEvent.setup();
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }), sourceWithOneRoom());
    await screen.findByText('Room 1');
    expect(screen.getByRole('heading', { level: 1, name: /live 3d room view/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Devices' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Activity' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Activity' })).toBeInTheDocument();
  });

  it('shows owners no Admin rail entry (and nothing "coming soon")', async () => {
    renderPage(new FakeAuthGateway({ initialSession: OWNER_SESSION }), sourceWithOneRoom());
    await screen.findByText('Room 1');
    expect(screen.queryByRole('button', { name: /admin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('still gives admins a rail entry to the Admin Console', async () => {
    const user = userEvent.setup();
    renderPage(
      new FakeAuthGateway({
        initialSession: { uid: 'fake-uid-admin', email: 'admin@ecostay.test', role: 'admin' },
      }),
      sourceWithOneRoom(),
    );
    // Labeled "Admin" — it opens the admin console, not a settings page.
    await user.click(await screen.findByRole('button', { name: /admin/i }));
    expect(routerMock.push).toHaveBeenCalledWith('/admin');
  });
});
