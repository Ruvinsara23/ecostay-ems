import type { AdminPropertySummary, AdminRoomSummary } from '@/server/admin-directory';
import type { OwnerSummary } from '@/server/admin-owners';
import type { DeviceAccountInput, DeviceCredential } from '@/server/manage-device';
import type { CreateOwnerInput } from '@/server/manage-owner';
import type { RegisterRoomInput } from '@/server/register-room';

/**
 * Admin operations that go through server API routes (Admin SDK). The UI depends
 * on this port only — never on `fetch` or the Admin SDK directly. Same seam idea
 * as RoomDataSource: a real HTTP adapter + an in-memory fake for tests.
 */
export interface AdminOperations {
  listProperties(): Promise<AdminPropertySummary[]>;
  listRooms(propertyId: string): Promise<AdminRoomSummary[]>;
  registerRoom(input: RegisterRoomInput): Promise<void>;
  listOwners(): Promise<OwnerSummary[]>;
  createOwner(input: CreateOwnerInput): Promise<{ uid: string }>;
  setOwnerDisabled(uid: string, disabled: boolean): Promise<void>;
  resetOwnerPassword(email: string): Promise<{ resetLink: string }>;
  createDeviceAccount(input: DeviceAccountInput): Promise<DeviceCredential>;
  resetDeviceCredential(input: DeviceAccountInput): Promise<DeviceCredential>;
}

/** Real adapter: calls the admin API routes with the caller's ID token. */
export function createHttpAdminOperations(
  getIdToken: () => Promise<string | null>,
): AdminOperations {
  async function send(path: string, method: 'GET' | 'POST', body?: unknown): Promise<Response> {
    const token = await getIdToken();
    const res = await fetch(path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(detail.error ?? `Request failed (${res.status})`);
    }
    return res;
  }

  return {
    async listProperties() {
      const { properties } = (await (await send('/api/admin/properties', 'GET')).json()) as {
        properties: AdminPropertySummary[];
      };
      return properties;
    },
    async listRooms(propertyId) {
      const { rooms } = (await (
        await send(`/api/admin/rooms?propertyId=${encodeURIComponent(propertyId)}`, 'GET')
      ).json()) as { rooms: AdminRoomSummary[] };
      return rooms;
    },
    async registerRoom(input) {
      await send('/api/admin/rooms/register', 'POST', input);
    },
    async listOwners() {
      const { owners } = (await (await send('/api/admin/owners', 'GET')).json()) as {
        owners: OwnerSummary[];
      };
      return owners;
    },
    async createOwner(input) {
      return (await (await send('/api/admin/owners', 'POST', { action: 'create', ...input })).json()) as {
        uid: string;
      };
    },
    async setOwnerDisabled(uid, disabled) {
      await send('/api/admin/owners', 'POST', { action: 'setDisabled', uid, disabled });
    },
    async resetOwnerPassword(email) {
      return (await (await send('/api/admin/owners', 'POST', { action: 'resetPassword', email })).json()) as {
        resetLink: string;
      };
    },
    async createDeviceAccount(input) {
      return (await (
        await send('/api/admin/devices', 'POST', { action: 'create', ...input })
      ).json()) as DeviceCredential;
    },
    async resetDeviceCredential(input) {
      return (await (
        await send('/api/admin/devices', 'POST', { action: 'resetPassword', ...input })
      ).json()) as DeviceCredential;
    },
  };
}

// The in-memory fake lives in admin-operations.fake.ts — test/preview code only,
// so production bundles never carry it (AUDIT B hygiene).
