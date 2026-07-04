'use client';

import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import type { AuthGateway, Session } from './auth-gateway';

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session };

type AuthContextValue = {
  gateway: AuthGateway;
  sessionState: SessionState;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  gateway,
  children,
}: {
  gateway: AuthGateway;
  children: ReactNode;
}) {
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    return gateway.observeSession((session) => {
      setSessionState(session ? { status: 'signed-in', session } : { status: 'signed-out' });
    });
  }, [gateway]);

  return (
    <AuthContext.Provider value={{ gateway, sessionState }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return value;
}
