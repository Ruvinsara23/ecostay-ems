import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAdminOperations } from '@/admin/admin-operations';
import { AdminOperationsProvider } from '@/admin/admin-operations-context';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import { FakeRoomDataSource } from '@/rooms/fake-room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';
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
          <AdminPage />
        </AdminOperationsProvider>
      </RoomDataSourceProvider>
    </AuthProvider>,
  );
}

describe('admin console shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has a sign-out control in the rail', async () => {
    renderAdmin(new FakeAuthGateway({ initialSession: ADMIN_SESSION }));
    expect(await screen.findByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('defaults to the Properties view and lists registered properties', async () => {
    const operations = new FakeAdminOperations();
    operations.properties = [
      { propertyId: 'property_001', name: 'EcoStay Villa', roomCount: 2, ownerCount: 1 },
    ];
    renderAdmin(new FakeAuthGateway({ initialSession: ADMIN_SESSION }), operations);

    expect(await screen.findByText('EcoStay Villa')).toBeInTheDocument();
    expect(screen.getByText(/2 rooms · 1 owner/)).toBeInTheDocument();
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
