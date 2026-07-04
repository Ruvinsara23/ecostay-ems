import { render, screen, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AuthGateway, Session } from './auth-gateway';
import { AuthProvider, useAuth } from './auth-context';
import { FakeAuthGateway } from './fake-auth-gateway';

function Probe() {
  const { sessionState } = useAuth();
  if (sessionState.status === 'loading') return <p>state: loading</p>;
  if (sessionState.status === 'signed-out') return <p>state: signed-out</p>;
  return (
    <p>
      state: signed-in as {sessionState.session.email} ({sessionState.session.role})
    </p>
  );
}

const ownerSession: Session = {
  uid: 'fake-uid-owner@ecostay.test',
  email: 'owner@ecostay.test',
  role: 'owner',
};

describe('AuthProvider / useAuth', () => {
  it('is loading until the gateway reports the current session', () => {
    // A gateway that has not resolved the session yet (e.g. Firebase still restoring it).
    const silentGateway: AuthGateway = {
      signIn: async () => {},
      signOut: async () => {},
      observeSession: () => () => {},
    };
    render(
      <AuthProvider gateway={silentGateway}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('state: loading')).toBeInTheDocument();
  });

  it('reports signed-out once the gateway confirms there is no session', () => {
    render(
      <AuthProvider gateway={new FakeAuthGateway()}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('state: signed-out')).toBeInTheDocument();
  });

  it('restores an existing session without any sign-in (reload survives)', () => {
    const gateway = new FakeAuthGateway({ initialSession: ownerSession });
    render(
      <AuthProvider gateway={gateway}>
        <Probe />
      </AuthProvider>,
    );
    expect(
      screen.getByText('state: signed-in as owner@ecostay.test (owner)'),
    ).toBeInTheDocument();
  });

  it('follows the gateway through sign-in and sign-out', async () => {
    const gateway = new FakeAuthGateway();
    gateway.registerUser({
      email: 'owner@ecostay.test',
      password: 'owner-pass-1',
      role: 'owner',
    });
    render(
      <AuthProvider gateway={gateway}>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByText('state: signed-out')).toBeInTheDocument();

    await act(() => gateway.signIn('owner@ecostay.test', 'owner-pass-1'));
    expect(
      screen.getByText('state: signed-in as owner@ecostay.test (owner)'),
    ).toBeInTheDocument();

    await act(() => gateway.signOut());
    expect(screen.getByText('state: signed-out')).toBeInTheDocument();
  });

  it('refuses to run outside an AuthProvider with a clear error', () => {
    expect(() => render(<Probe />)).toThrowError(/AuthProvider/);
  });
});
