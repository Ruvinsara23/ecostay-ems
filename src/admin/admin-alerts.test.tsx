import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
import { FakeAdminOperations } from './admin-operations.fake';
import { AdminOperationsProvider } from './admin-operations-context';
import { AdminAlerts } from './admin-alerts';

const routerMock = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/admin/alerts',
}));

const ADMIN_SESSION = {
  uid: 'fake-uid-admin@ecostay.test',
  email: 'admin@ecostay.test',
  role: 'admin',
} as const;

function renderView(operations: FakeAdminOperations, source = new FakeRoomDataSource()) {
  return render(
    <AuthProvider gateway={new FakeAuthGateway({ initialSession: ADMIN_SESSION })}>
      <RoomDataSourceProvider source={source}>
        <AdminOperationsProvider operations={operations}>
          <AdminAlerts />
        </AdminOperationsProvider>
      </RoomDataSourceProvider>
    </AuthProvider>,
  );
}

describe('AdminAlerts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an alert center per property, with live alerts and acknowledge', async () => {
    const ops = new FakeAdminOperations();
    ops.properties = [
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 2, ownerCount: 1 },
      { propertyId: 'property_002', name: null, roomCount: 1, ownerCount: 0 },
    ];
    const source = new FakeRoomDataSource();
    source.emitAlerts('property_001', [
      {
        id: 'alert_1',
        roomId: 'room_002',
        type: 'gas',
        severity: 'critical',
        value: 120,
        startedAt: Date.UTC(2026, 6, 11, 3, 30),
      },
    ]);
    renderView(ops, source);

    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
    // property_001 has a live gas alert with the acknowledge action…
    expect(await screen.findByText('Gas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
    // …and property_002's center honestly reports quiet.
    expect(screen.getByText('property_002')).toBeInTheDocument();
    expect(screen.getByText(/no alerts — all quiet/i)).toBeInTheDocument();
  });

  it('shows an error with retry when the property list fails', async () => {
    const user = userEvent.setup();
    const ops = new FakeAdminOperations();
    ops.properties = [
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 1, ownerCount: 1 },
    ];
    ops.failWith = 'network down';
    renderView(ops);

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load properties/i);

    ops.failWith = null;
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
  });

  it('points at the Properties page when nothing is registered yet', async () => {
    renderView(new FakeAdminOperations());

    expect(await screen.findByText(/no properties yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /register the first one/i })).toHaveAttribute(
      'href',
      '/admin/properties',
    );
  });
});
