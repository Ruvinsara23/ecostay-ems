'use client';

import { getAuth } from 'firebase/auth';
import { ReactNode, useState } from 'react';
import { AuthProvider } from '@/auth/auth-context';
import type { AuthGateway } from '@/auth/auth-gateway';
import { AuthGatewayError } from '@/auth/auth-gateway';
import { createFirebaseAuthGateway } from '@/auth/firebase-auth-gateway';
import { getFirebaseApp } from '@/firebase/app';

// During prerender there is no browser and no session to observe; this stand-in
// keeps the tree in the 'loading' state until the client constructs the real gateway.
const prerenderGateway: AuthGateway = {
  async signIn() {
    throw new AuthGatewayError('unavailable');
  },
  async signOut() {},
  observeSession() {
    return () => {};
  },
};

export function AppProviders({ children }: { children: ReactNode }) {
  const [gateway] = useState<AuthGateway>(() =>
    typeof window === 'undefined'
      ? prerenderGateway
      : createFirebaseAuthGateway(getAuth(getFirebaseApp())),
  );
  return <AuthProvider gateway={gateway}>{children}</AuthProvider>;
}
