import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAdminOperations } from '@/admin/admin-operations.fake';
import { AdminOperationsProvider } from '@/admin/admin-operations-context';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
import PropertyDetailPage from '@/app/admin/properties/[pid]/page';

const routerMock = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/admin/properties/property_001',
  useParams: () => ({ pid: 'property_001' }),
}));

const ADMIN_SESSION = {
  uid: 'fake-uid-admin@ecostay.test',
  email: 'admin@ecostay.test',
  role: 'admin',
} as const;

function renderDetail(
  operations: FakeAdminOperations,
  source: FakeRoomDataSource = new FakeRoomDataSource(),
) {
  return render(
    <AuthProvider gateway={new FakeAuthGateway({ initialSession: ADMIN_SESSION })}>
      <RoomDataSourceProvider source={source}>
        <AdminOperationsProvider operations={operations}>
          <PropertyDetailPage />
        </AdminOperationsProvider>
      </RoomDataSourceProvider>
    </AuthProvider>,
  );
}

describe('property detail page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the property rooms with device-account and last-seen status', async () => {
    const ops = new FakeAdminOperations();
    ops.roomsByProperty = {
      property_001: [
        {
          roomId: 'room_001',
          roomName: 'Garden Room',
          deviceAccountEmail: 'device+property_001+room_001@devices.ecostay.local',
          lastSeenAt: 1_752_000_000_000,
        },
        { roomId: 'room_002', roomName: null, deviceAccountEmail: null, lastSeenAt: null },
      ],
    };
    renderDetail(ops);

    expect(await screen.findByText('Garden Room')).toBeInTheDocument();
    expect(
      screen.getByText('device+property_001+room_001@devices.ecostay.local'),
    ).toBeInTheDocument();
    expect(screen.getByText(/last seen/i)).toBeInTheDocument();
    // The unprovisioned room is honest about both gaps.
    expect(screen.getByText('room_002')).toBeInTheDocument();
    expect(screen.getByText(/no device account/i)).toBeInTheDocument();
    expect(screen.getByText(/never reported/i)).toBeInTheDocument();
  });

  it('explains when the property has no rooms yet', async () => {
    renderDetail(new FakeAdminOperations());
    expect(await screen.findByText(/no rooms registered/i)).toBeInTheDocument();
  });

  it('links back to the properties list', async () => {
    renderDetail(new FakeAdminOperations());
    const back = await screen.findByRole('link', { name: /back to properties/i });
    expect(back).toHaveAttribute('href', '/admin/properties');
  });
});

describe('property detail — embedded settings (slice 07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows this property’s settings inline, loaded from the routed property id', async () => {
    const source = new FakeRoomDataSource();
    source.setTariffCategory('property_001', 'H-1');
    renderDetail(new FakeAdminOperations(), source);

    await waitFor(() => expect(screen.getByLabelText(/tariff category/i)).toHaveValue('H-1'));
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });
});

describe('property detail — owners section (slice 06 read)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists only the owners with access to THIS property, with status badges', async () => {
    const ops = new FakeAdminOperations();
    ops.owners = [
      { uid: 'uid_1', email: 'anna@ecostay.test', disabled: false, propertyIds: ['property_001'] },
      { uid: 'uid_2', email: 'ben@ecostay.test', disabled: true, propertyIds: ['property_001', 'property_002'] },
      { uid: 'uid_3', email: 'other@ecostay.test', disabled: false, propertyIds: ['property_002'] },
    ];
    renderDetail(ops);

    expect(await screen.findByText('anna@ecostay.test')).toBeInTheDocument();
    expect(screen.getByText('ben@ecostay.test')).toBeInTheDocument();
    // The unassigned owner is offered only in the assign dropdown, never as a member row.
    const stray = screen.getAllByText('other@ecostay.test');
    expect(stray.every((el) => el.tagName === 'OPTION')).toBe(true);
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('is honest when nobody has access, and links to the Owners view', async () => {
    renderDetail(new FakeAdminOperations());

    expect(await screen.findByText(/no owners have access/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /manage owners/i })).toHaveAttribute(
      'href',
      '/admin/owners',
    );
  });
});

describe('property detail — owner access writes (slice 06, gate #1 approved)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function opsWithOwners() {
    const ops = new FakeAdminOperations();
    ops.owners = [
      { uid: 'uid_1', email: 'anna@ecostay.test', disabled: false, propertyIds: ['property_001'] },
      { uid: 'uid_2', email: 'ben@ecostay.test', disabled: false, propertyIds: ['property_002'] },
    ];
    return ops;
  }

  it('assigns an existing owner picked from the unassigned list', async () => {
    const user = userEvent.setup();
    const ops = opsWithOwners();
    renderDetail(ops);

    await user.selectOptions(
      await screen.findByLabelText(/assign an existing owner/i),
      'uid_2',
    );
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    await waitFor(() =>
      expect(ops.owners[1].propertyIds).toEqual(['property_002', 'property_001']),
    );
    // The refreshed list now shows ben as assigned.
    expect(await screen.findByText('ben@ecostay.test')).toBeInTheDocument();
  });

  it('removing access requires confirmation, then updates the list', async () => {
    const user = userEvent.setup();
    const ops = opsWithOwners();
    renderDetail(ops);

    await user.click(await screen.findByRole('button', { name: /remove access/i }));
    expect(ops.owners[0].propertyIds).toEqual(['property_001']); // nothing yet
    const dialog = await screen.findByRole('dialog', { name: /remove this owner/i });
    await user.click(within(dialog).getByRole('button', { name: 'Remove access' }));

    await waitFor(() => expect(ops.owners[0].propertyIds).toEqual([]));
    expect(await screen.findByText(/no owners have access/i)).toBeInTheDocument();
  });

  it('cancelling the removal changes nothing', async () => {
    const user = userEvent.setup();
    const ops = opsWithOwners();
    renderDetail(ops);

    await user.click(await screen.findByRole('button', { name: /remove access/i }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(ops.owners[0].propertyIds).toEqual(['property_001']);
    expect(screen.getByText('anna@ecostay.test')).toBeInTheDocument();
  });

  it('surfaces an assign failure without corrupting the list', async () => {
    const user = userEvent.setup();
    const ops = opsWithOwners();
    renderDetail(ops);

    await user.selectOptions(
      await screen.findByLabelText(/assign an existing owner/i),
      'uid_2',
    );
    ops.failWith = 'owner already has access to this property';
    await user.click(screen.getByRole('button', { name: /^assign$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already has access/i);
  });
});

describe('property detail — inline room registration (slice 05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a room with the property id pre-bound from the route', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    renderDetail(ops);

    // No free-text property box anywhere — the route decides the property.
    expect(screen.queryByLabelText(/property id/i)).not.toBeInTheDocument();

    await user.type(await screen.findByLabelText('Room ID'), 'room_009');
    await user.type(screen.getByLabelText('Room name'), 'Lake Room');
    // Simulate the server accepting the registration before the list refresh.
    ops.roomsByProperty = {
      property_001: [
        { roomId: 'room_009', roomName: 'Lake Room', deviceAccountEmail: null, lastSeenAt: null },
      ],
    };
    await user.click(screen.getByRole('button', { name: /register room/i }));

    expect(ops.registrations).toEqual([
      { propertyId: 'property_001', roomId: 'room_009', roomName: 'Lake Room' },
    ]);
    // The list refreshed and now shows the new room.
    expect(await screen.findByText('Lake Room')).toBeInTheDocument();
    expect(screen.getByText('Room registered')).toBeInTheDocument();
  });

  it('shows the server error when registration fails', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    renderDetail(ops);

    await user.type(await screen.findByLabelText('Room ID'), 'room_009');
    ops.failWith = 'roomId must match room_NNN';
    await user.click(screen.getByRole('button', { name: /register room/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('roomId must match room_NNN');
  });
});

describe('property detail — per-room device credentials (slice 05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const unprovisioned = {
    property_001: [
      { roomId: 'room_001', roomName: 'Garden Room', deviceAccountEmail: null, lastSeenAt: null },
    ],
  };
  const provisioned = {
    property_001: [
      {
        roomId: 'room_001',
        roomName: 'Garden Room',
        deviceAccountEmail: 'device+property_001+room_001@devices.ecostay.local',
        lastSeenAt: null,
      },
    ],
  };

  it('creates a device account for a room and shows the credential once', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    ops.roomsByProperty = unprovisioned;
    renderDetail(ops);

    await user.click(await screen.findByRole('button', { name: /create device account/i }));

    expect(ops.deviceCreates).toEqual([{ propertyId: 'property_001', roomId: 'room_001' }]);
    expect(
      await screen.findByText('device+property_001+room_001@devices.ecostay.local'),
    ).toBeInTheDocument();
    expect(screen.getByText('fake-device-password')).toBeInTheDocument();
    expect(screen.getByText(/shown once/i)).toBeInTheDocument();
  });

  it('resetting a credential requires confirmation first', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    ops.roomsByProperty = provisioned;
    renderDetail(ops);

    await user.click(await screen.findByRole('button', { name: /reset password/i }));
    // Nothing reset yet — the dialog is asking.
    expect(ops.deviceResets).toEqual([]);
    const dialog = await screen.findByRole('dialog', { name: /reset device password/i });
    expect(dialog).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Reset password' }));
    await waitFor(() =>
      expect(ops.deviceResets).toEqual([{ propertyId: 'property_001', roomId: 'room_001' }]),
    );
    expect(await screen.findByText('fake-device-password')).toBeInTheDocument();
  });

  it('cancelling the confirmation resets nothing', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    ops.roomsByProperty = provisioned;
    renderDetail(ops);

    await user.click(await screen.findByRole('button', { name: /reset password/i }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(ops.deviceResets).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
