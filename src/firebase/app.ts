import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';

// NEXT_PUBLIC_* reads must be static property accesses so Next can inline them
// into the client bundle. This config is public BY DESIGN — security lives in
// the RTDB rules, never in hiding the config (ADR-0003, .env.example).
function readConfig() {
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    ...(appId ? { appId } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
  };
}

const REQUIRED_ENV_NAMES = {
  apiKey: 'NEXT_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  databaseURL: 'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
  projectId: 'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
} as const;

export function getFirebaseApp(): FirebaseApp {
  const config = readConfig();
  const missing = (Object.keys(REQUIRED_ENV_NAMES) as Array<keyof typeof REQUIRED_ENV_NAMES>)
    .filter((key) => !config[key])
    .map((key) => REQUIRED_ENV_NAMES[key]);
  if (missing.length > 0) {
    throw new Error(
      `Firebase config incomplete — missing env vars: ${missing.join(', ')}. ` +
        'Copy .env.example to .env.local and fill in the values.',
    );
  }
  return getApps().length > 0 ? getApp() : initializeApp(config);
}
