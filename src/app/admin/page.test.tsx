import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAdminOperations } from '@/admin/admin-operations.fake';
import { AdminOperationsProvider } from '@/admin/admin-operations-context';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
import AdminLayout from '@/app/admin/layout';
import AdminPage from '@/app/admin/page';

const routerMock = { replace: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => '/admin',
}));

const ADMIN_SESSION = {
  uid: 'fake-uid-admin@ecostay.test',
  email: 'admin@ecostay.test',
  role: 'admin',
} as const;

function renderAdmin(
  gateway: FakeAuthGateway,
  operations: FakeAdminOperations = new FakeAdminOperations(),
) {
  return render(
    <AuthProvider gateway={gateway}>
      <RoomDataSourceProvider source={new FakeRoomDataSource()}>
        <AdminOperationsProvider operations={operations}>
          <AdminLayout>
            <AdminPage />
          </AdminLayout>
        </AdminOperationsProvider>
      </RoomDataSourceProvider>
    </AuthProvider>,
  );
}

describe('admin console shell (sub-route chassis)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has a sign-out control in the rail', async () => {
    renderAdmin(new FakeAuthGateway({ initialSession: ADMIN_SESSION }));
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('the rail is real links: Overview · Properties · Owners (v2 slice 09)', async () => {
    renderAdmin(new FakeAuthGateway({ initialSession: ADMIN_SESSION }));

    expect(await screen.findByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(screen.getByRole('link', { name: 'Properties' })).toHaveAttribute(
      'href',
      '/admin/properties',
    );
    expect(screen.getByRole('link', { name: 'Owners' })).toHaveAttribute('href', '/admin/owners');
    // No generic dashboard/live entry: admins reach live views per-room via
    // the property detail's "View live" links (owner-reported confusion).
    expect(screen.queryByRole('link', { name: /live rooms/i })).not.toBeInTheDocument();
    // Rooms and Settings live inside property detail now — no standalone entries.
    expect(screen.queryByRole('link', { name: 'Rooms' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('marks the current route active in the rail', async () => {
    renderAdmin(new FakeAuthGateway({ initialSession: ADMIN_SESSION }));

    const overview = await screen.findByRole('link', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Properties' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Owners' })).not.toHaveAttribute('aria-current');
  });

  it('defaults to the fleet Overview with per-property health', async () => {
    const operations = new FakeAdminOperations();
    operations.statuses = [
      {
        propertyId: 'property_001',
        name: 'EcoStay Villa',
        roomCount: 2,
        roomsReporting: 2,
        openAlerts: [],
      },
    ];
    renderAdmin(new FakeAuthGateway({ initialSession: ADMIN_SESSION }), operations);

    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
    expect(screen.getByText('All reporting')).toBeInTheDocument();
    expect(screen.getByText('Rooms reporting')).toBeInTheDocument();
  });

  it('signing out ends the session and lands back on login', async () => {
    const user = userEvent.setup();
    renderAdmin(new FakeAuthGateway({ initialSession: ADMIN_SESSION }));

    await user.click(await screen.findByRole('button', { name: /sign out/i }));

    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith('/login?next=%2Fadmin'),
    );
  });
});
