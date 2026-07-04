import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthGateway, Session } from './auth-gateway';
import { AuthProvider } from './auth-context';
import { FakeAuthGateway } from './fake-auth-gateway';
import { RequireSession } from './require-session';

const routerMock = { replace: vi.fn(), push: vi.fn() };
let pathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => pathname,
}));

function renderGuarded(gateway: AuthGateway) {
  return render(
    <AuthProvider gateway={gateway}>
      <RequireSession>
        <p>protected content</p>
      </RequireSession>
    </AuthProvider>,
  );
}

function sessionOf(role: Session['role']): Session {
  return { uid: `fake-uid-${role}`, email: `${role}@ecostay.test`, role };
}

describe('RequireSession guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = '/';
  });

  it('shows nothing but a loading state while the session is being restored', () => {
    const silentGateway: AuthGateway = {
      signIn: async () => {},
      signOut: async () => {},
      observeSession: () => () => {},
    };
    renderGuarded(silentGateway);
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('redirects a signed-out visitor to login, preserving the requested path', async () => {
    pathname = '/rooms/room_001';
    renderGuarded(new FakeAuthGateway());
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith(
        '/login?next=%2Frooms%2Froom_001',
      ),
    );
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders the protected content for an owner', () => {
    renderGuarded(new FakeAuthGateway({ initialSession: sessionOf('owner') }));
    expect(screen.getByText('protected content')).toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('renders the protected content for an admin', () => {
    renderGuarded(new FakeAuthGateway({ initialSession: sessionOf('admin') }));
    expect(screen.getByText('protected content')).toBeInTheDocument();
  });

  it('treats a device-role session as unauthorized (defense in depth)', async () => {
    renderGuarded(new FakeAuthGateway({ initialSession: sessionOf('device') }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalled());
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });
});
