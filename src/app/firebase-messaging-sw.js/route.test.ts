import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const ALL_ENV = {
  NEXT_PUBLIC_FIREBASE_API_KEY: 'test-api-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: 'https://test-rtdb.firebasedatabase.app',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'test-project',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '123456',
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:123456:web:abc',
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('service worker route', () => {
  it('serves an env-configured messaging service worker', async () => {
    for (const [key, value] of Object.entries(ALL_ENV)) vi.stubEnv(key, value);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/javascript/);
    const body = await response.text();
    expect(body).toContain('"messagingSenderId":"123456"');
    expect(body).toContain('"appId":"1:123456:web:abc"');
    expect(body).toContain('onBackgroundMessage');
    expect(body).not.toContain('REPLACE_WITH');
  });

  it('returns 404 when the messaging config is incomplete', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'test-api-key');
    // sender id / app id intentionally absent

    const response = await GET();

    expect(response.status).toBe(404);
  });
});
