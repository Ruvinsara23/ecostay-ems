import type { RegisterRoomInput } from '@/server/register-room';

/**
 * Admin operations that go through server API routes (Admin SDK). The UI depends
 * on this port only — never on `fetch` or the Admin SDK directly. Same seam idea
 * as RoomDataSource: a real HTTP adapter + an in-memory fake for tests.
 */
export interface AdminOperations {
  registerRoom(input: RegisterRoomInput): Promise<void>;
}

/** Real adapter: POSTs to /api/admin/rooms/register with the caller's ID token. */
export function createHttpAdminOperations(
  getIdToken: () => Promise<string | null>,
): AdminOperations {
  return {
    async registerRoom(input) {
      const token = await getIdToken();
      const res = await fetch('/api/admin/rooms/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(detail.error ?? `Registration failed (${res.status})`);
      }
    },
  };
}

/** In-memory fake for tests. */
export class FakeAdminOperations implements AdminOperations {
  registrations: RegisterRoomInput[] = [];
  failWith: string | null = null;

  async registerRoom(input: RegisterRoomInput): Promise<void> {
    if (this.failWith) throw new Error(this.failWith);
    this.registrations.push(input);
  }
}
