'use client';

import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { ReactNode, useState } from 'react';
import type { AdminOperations } from '@/admin/admin-operations';
import { createHttpAdminOperations } from '@/admin/admin-operations';
import { AdminOperationsProvider } from '@/admin/admin-operations-context';
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
  subscribeAutomationEnabled() {
    return () => {};
  },
  async setAutomationEnabled() {
    throw new Error('not available during prerender');
  },
  subscribeEnergyHistory() {
    return () => {};
  },
  subscribeDailyAggregates() {
    return () => {};
  },
  subscribeTariffCategory() {
    return () => {};
  },
  async setTariffCategory() {
    throw new Error('not available during prerender');
  },
  subscribeCircuitWattages() {
    return () => {};
  },
  async setCircuitWattages() {
    throw new Error('not available during prerender');
  },
  subscribeAlertThresholds() {
    return () => {};
  },
  async setAlertThresholds() {
    throw new Error('not available during prerender');
  },
  subscribeAlerts() {
    return () => {};
  },
  async acknowledgeAlert() {
    throw new Error('not available during prerender');
  },
  subscribeEvaluationRuns() {
    return () => {};
  },
  async startEvaluationRun() {
    throw new Error('not available during prerender');
  },
  async endEvaluationRun() {
    throw new Error('not available during prerender');
  },
  async deleteEvaluationRun() {
    throw new Error('not available during prerender');
  },
};

const prerenderAdminOperations: AdminOperations = {
  async fleetStatus() {
    return [];
  },
  async listProperties() {
    return [];
  },
  async listRooms() {
    return [];
  },
  async registerRoom() {
    throw new Error('not available during prerender');
  },
  async listOwners() {
    return [];
  },
  async createOwner() {
    throw new Error('not available during prerender');
  },
  async assignOwnerToProperty() {
    throw new Error('not available during prerender');
  },
  async removeOwnerFromProperty() {
    throw new Error('not available during prerender');
  },
  async setOwnerDisabled() {
    throw new Error('not available during prerender');
  },
  async resetOwnerPassword() {
    throw new Error('not available during prerender');
  },
  async createDeviceAccount() {
    throw new Error('not available during prerender');
  },
  async resetDeviceCredential() {
    throw new Error('not available during prerender');
  },
};

export function AppProviders({ children }: { children: ReactNode }) {
  const [adapters] = useState<{
    gateway: AuthGateway;
    roomDataSource: RoomDataSource;
    adminOperations: AdminOperations;
  }>(() => {
    if (typeof window === 'undefined') {
      return {
        gateway: prerenderGateway,
        roomDataSource: prerenderRoomDataSource,
        adminOperations: prerenderAdminOperations,
      };
    }
    const app = getFirebaseApp();
    const auth = getAuth(app);
    return {
      gateway: createFirebaseAuthGateway(auth),
      roomDataSource: createFirebaseRoomDataSource(getDatabase(app)),
      adminOperations: createHttpAdminOperations(() =>
        auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null),
      ),
    };
  });
  return (
    <AuthProvider gateway={adapters.gateway}>
      <RoomDataSourceProvider source={adapters.roomDataSource}>
        <AdminOperationsProvider operations={adapters.adminOperations}>
          {children}
        </AdminOperationsProvider>
      </RoomDataSourceProvider>
    </AuthProvider>
  );
}
