import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFirebaseApp } from './app';

const ENV_KEYS = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
] as const;

function stubFullConfig() {
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'test-api-key');
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', 'test.firebaseapp.com');
  vi.stubEnv(
    'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
    'https://test-default-rtdb.asia-southeast1.firebasedatabase.app',
  );
  vi.stubEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID', 'test-project');
}

describe('getFirebaseApp', () => {
  beforeEach(() => {
    ENV_KEYS.forEach((key) => vi.stubEnv(key, undefined));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('fails fast with the names of the missing env keys', () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'only-this-one');
    expect(() => getFirebaseApp()).toThrowError(
      /NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN[\s\S]*NEXT_PUBLIC_FIREBASE_DATABASE_URL[\s\S]*NEXT_PUBLIC_FIREBASE_PROJECT_ID/,
    );
  });

  it('initializes the app from the public env config', () => {
    stubFullConfig();
    const app = getFirebaseApp();
    expect(app.options.projectId).toBe('test-project');
    expect(app.options.databaseURL).toBe(
      'https://test-default-rtdb.asia-southeast1.firebasedatabase.app',
    );
  });

  it('reuses the same app instance on repeat calls', () => {
    stubFullConfig();
    expect(getFirebaseApp()).toBe(getFirebaseApp());
  });
});
