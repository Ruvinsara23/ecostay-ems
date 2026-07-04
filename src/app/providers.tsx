'use client';

import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { ReactNode, useState } from 'react';
import { AuthProvider } from '@/auth/auth-context';
import type { AuthGateway } from '@/auth/auth-gateway';
import { AuthGatewayError } from '@/auth/auth-gateway';
import { createFirebaseAuthGateway } from '@/auth/firebase-auth-gateway';
import { getFirebaseApp } from '@/firebase/app';
import { createFirebaseRoomDataSource } from '@/rooms/firebase-room-data-source';
import type { RoomDataSource } from '@/rooms/room-data-source';
import { RoomDataSourceProvider } from '@/rooms/room-data-source-context';

// During prerender there is no browser: these stand-ins keep the tree in its
// loading states until the client constructs the real adapters.
const prerenderGateway: AuthGateway = {
  async signIn() {
    throw new AuthGatewayError('unavailable');
  },
  async signOut() {},
  observeSession() {
    return () => {};
  },
};

const prerenderRoomDataSource: RoomDataSource = {
  async listAccessibleRooms() {
    return [];
  },
  subscribeLatest() {
    return () => {};
  },
  subscribeServerTimeOffset() {
    return () => {};
  },
  subscribeDeviceCommands() {
    return () => {};
  },
  async setDeviceCommand() {
    throw new Error('not available during prerender');
  },
};

export function AppProviders({ children }: { children: ReactNode }) {
  const [adapters] = useState<{ gateway: AuthGateway; roomDataSource: RoomDataSource }>(() => {
    if (typeof window === 'undefined') {
      return { gateway: prerenderGateway, roomDataSource: prerenderRoomDataSource };
    }
    const app = getFirebaseApp();
    return {
      gateway: createFirebaseAuthGateway(getAuth(app)),
      roomDataSource: createFirebaseRoomDataSource(getDatabase(app)),
    };
  });
  return (
    <AuthProvider gateway={adapters.gateway}>
      <RoomDataSourceProvider source={adapters.roomDataSource}>
        {children}
      </RoomDataSourceProvider>
    </AuthProvider>
  );
}
