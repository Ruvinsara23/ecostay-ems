import { App, applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Database, getDatabase } from 'firebase-admin/database';

/**
 * Admin SDK entry for the server workloads (ADR-0010). Credential source, in order:
 * 1. FIREBASE_SERVICE_ACCOUNT — the full service-account JSON in an env var (Vercel).
 * 2. GOOGLE_APPLICATION_CREDENTIALS — key file path (local human runs).
 * 3. Emulator mode — FIREBASE_DATABASE_EMULATOR_HOST set; no credential needed.
 * Secrets never live in the repo (risk gate #5).
 */
export function getAdminDatabase(): Database {
  const existing = getApps()[0];
  if (existing) return getDatabase(existing as App);

  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ?? process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error('FIREBASE_DATABASE_URL (or NEXT_PUBLIC_FIREBASE_DATABASE_URL) is not set');
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  const usingEmulator = Boolean(process.env.FIREBASE_DATABASE_EMULATOR_HOST);

  if (serviceAccountJson) {
    return getDatabase(
      initializeApp({ credential: cert(JSON.parse(serviceAccountJson)), databaseURL }),
    );
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return getDatabase(initializeApp({ credential: applicationDefault(), databaseURL }));
  }
  if (usingEmulator) {
    return getDatabase(
      initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'demo-ecostay', databaseURL }),
    );
  }
  throw new Error(
    'No admin credential: set FIREBASE_SERVICE_ACCOUNT, GOOGLE_APPLICATION_CREDENTIALS, or emulator hosts',
  );
}
