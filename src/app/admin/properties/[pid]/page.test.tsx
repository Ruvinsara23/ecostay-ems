import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAdminOperations } from '@/admin/admin-operations';
import { AdminOperationsProvider } from '@/admin/admin-operations-context';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
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

function renderDetail(operations: FakeAdminOperations) {
  return render(
    <AuthProvider gateway={new FakeAuthGateway({ initialSession: ADMIN_SESSION })}>
      <AdminOperationsProvider operations={operations}>
        <PropertyDetailPage />
      </AdminOperationsProvider>
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
    expect(back).toHaveAttribute('href', '/admin');
  });
});
