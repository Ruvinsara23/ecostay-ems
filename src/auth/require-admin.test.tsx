import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthGateway, Session } from './auth-gateway';
import { AuthProvider } from './auth-context';
import { FakeAuthGateway } from './fake-auth-gateway';
import { RequireAdmin } from './require-admin';

const routerMock = { replace: vi.fn(), push: vi.fn() };
let pathname = '/admin';

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  usePathname: () => pathname,
}));

function renderGuarded(gateway: AuthGateway) {
  return render(
    <AuthProvider gateway={gateway}>
      <RequireAdmin>
        <p>admin content</p>
      </RequireAdmin>
    </AuthProvider>,
  );
}

const sessionOf = (role: Session['role']): Session => ({
  uid: `uid-${role}`,
  email: `${role}@ecostay.test`,
  role,
});

describe('RequireAdmin guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = '/admin';
  });

  it('renders admin content for an admin', () => {
    renderGuarded(new FakeAuthGateway({ initialSession: sessionOf('admin') }));
    expect(screen.getByText('admin content')).toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('redirects an owner to the dashboard (not the admin area)', async () => {
    renderGuarded(new FakeAuthGateway({ initialSession: sessionOf('owner') }));
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'));
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
  });

  it('sends a signed-out visitor to login, preserving the path', async () => {
    renderGuarded(new FakeAuthGateway());
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith('/login?next=%2Fadmin'),
    );
  });

  it('shows nothing but loading while the session resolves', () => {
    const silent: AuthGateway = {
      signIn: async () => {},
      signOut: async () => {},
      observeSession: () => () => {},
    };
    renderGuarded(silent);
    expect(screen.queryByText('admin content')).not.toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });
});
