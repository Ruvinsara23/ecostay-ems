import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/auth/auth-context';
import { FakeAuthGateway } from '@/auth/fake-auth-gateway';
import LoginPage from './page';

const routerMock = { replace: vi.fn(), push: vi.fn() };
let searchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => routerMock,
  useSearchParams: () => searchParams,
}));

function renderLogin(gateway: FakeAuthGateway) {
  return render(
    <AuthProvider gateway={gateway}>
      <LoginPage />
    </AuthProvider>,
  );
}

function ownerGateway() {
  const gateway = new FakeAuthGateway();
  gateway.registerUser({
    email: 'owner@ecostay.test',
    password: 'owner-pass-1',
    role: 'owner',
  });
  return gateway;
}

function adminGateway() {
  const gateway = new FakeAuthGateway();
  gateway.registerUser({
    email: 'admin@ecostay.test',
    password: 'admin-pass-1',
    role: 'admin',
  });
  return gateway;
}

async function submitCredentials(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/password/i), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('login page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams = new URLSearchParams();
  });

  it('signs in with valid credentials and redirects to the dashboard', async () => {
    renderLogin(ownerGateway());
    await submitCredentials('owner@ecostay.test', 'owner-pass-1');
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'));
  });

  it('sends admins to the Admin Console by default', async () => {
    renderLogin(adminGateway());
    await submitCredentials('admin@ecostay.test', 'admin-pass-1');
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/admin'));
  });

  it('returns the owner to the path they originally requested', async () => {
    searchParams = new URLSearchParams('next=%2Frooms%2Froom_001');
    renderLogin(ownerGateway());
    await submitCredentials('owner@ecostay.test', 'owner-pass-1');
    await waitFor(() =>
      expect(routerMock.replace).toHaveBeenCalledWith('/rooms/room_001'),
    );
  });

  it('never redirects outside the app (open-redirect guard on next)', async () => {
    searchParams = new URLSearchParams('next=https%3A%2F%2Fevil.example');
    renderLogin(ownerGateway());
    await submitCredentials('owner@ecostay.test', 'owner-pass-1');
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'));
  });

  it('falls back to the Admin Console for an admin when next is unsafe', async () => {
    searchParams = new URLSearchParams('next=https%3A%2F%2Fevil.example');
    renderLogin(adminGateway());
    await submitCredentials('admin@ecostay.test', 'admin-pass-1');
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/admin'));
  });

  it('shows a clear error for wrong credentials and stays on the page', async () => {
    renderLogin(ownerGateway());
    await submitCredentials('owner@ecostay.test', 'WRONG');
    expect(
      await screen.findByText(/incorrect email or password/i),
    ).toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('tells an unprovisioned account to contact the administrator', async () => {
    const gateway = ownerGateway();
    gateway.registerUser({
      email: 'unclaimed@ecostay.test',
      password: 'unclaimed-pass-1',
    });
    renderLogin(gateway);
    await submitCredentials('unclaimed@ecostay.test', 'unclaimed-pass-1');
    expect(await screen.findByText(/not provisioned/i)).toBeInTheDocument();
    expect(routerMock.replace).not.toHaveBeenCalled();
  });

  it('redirects straight to the dashboard when already signed in', async () => {
    const gateway = new FakeAuthGateway({
      initialSession: {
        uid: 'fake-uid-owner@ecostay.test',
        email: 'owner@ecostay.test',
        role: 'owner',
      },
    });
    renderLogin(gateway);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/'));
  });

  it('redirects an already signed-in admin straight to the Admin Console', async () => {
    const gateway = new FakeAuthGateway({
      initialSession: {
        uid: 'fake-uid-admin@ecostay.test',
        email: 'admin@ecostay.test',
        role: 'admin',
      },
    });
    renderLogin(gateway);
    await waitFor(() => expect(routerMock.replace).toHaveBeenCalledWith('/admin'));
  });
});
