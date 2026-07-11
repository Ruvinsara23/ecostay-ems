import { getFirebaseApp } from '@/firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/auth-context';
import { ref, set } from 'firebase/database';
import { getDatabase } from 'firebase/database';

// You will need to generate a VAPID key in the Firebase Console (Cloud Messaging -> Web Push certs)
// and put it in NEXT_PUBLIC_FIREBASE_VAPID_KEY in .env.local
function readFcmConfig() {
  return {
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
  };
}

function hasFcmConfig() {
  const config = readFcmConfig();
  return Boolean(config.appId && config.messagingSenderId && config.vapidKey);
}

/** RTDB keys forbid . # $ / [ ] — sanitize the FCM token before using it as a key. */
export function fcmTokenKey(token: string): string {
  return token.replace(/[.#$\/\[\]]/g, '_');
}

export function useFcm() {
  const { sessionState } = useAuth();
  const uid = sessionState.status === 'signed-in' ? sessionState.session.uid : null;
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [foregroundMessage, setForegroundMessage] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default',
  );
  const isAvailable = hasFcmConfig();

  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!hasFcmConfig()) {
      setError('Push notifications are not configured.');
      return;
    }

    try {
      const { vapidKey } = readFcmConfig();
      const p = await Notification.requestPermission();
      setPermission(p);

      if (p === 'granted') {
        const app = getFirebaseApp();
        const messaging = getMessaging(app);
        const currentToken = await getToken(messaging, {
          vapidKey,
        });

        if (currentToken) {
          setToken(currentToken);
          if (uid) {
            // Key is the sanitized token; value is the RAW token the server sends to.
            const db = getDatabase(app);
            await set(ref(db, `users/${uid}/fcmTokens/${fcmTokenKey(currentToken)}`), currentToken);
          }
        } else {
          setError('No registration token available. Request permission to generate one.');
        }
      }
    } catch (err) {
      console.error('An error occurred while retrieving token. ', err);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [uid]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hasFcmConfig()) return;

    try {
      const app = getFirebaseApp();
      const messaging = getMessaging(app);
      const unsubscribe = onMessage(messaging, (payload) => {
        // Surface pushes that arrive while the app is OPEN (background pushes go
        // through the service worker) — previously these were silently dropped.
        setForegroundMessage({
          title: payload.notification?.title ?? 'EcoStay alert',
          body: payload.notification?.body ?? '',
        });
      });
      return unsubscribe;
    } catch (err) {
      // getMessaging may fail if config is missing messagingSenderId
      console.warn('FCM not initialized:', err);
    }
  }, []);

  const dismissForegroundMessage = useCallback(() => setForegroundMessage(null), []);

  return {
    token,
    requestPermission,
    permission,
    error,
    isAvailable,
    foregroundMessage,
    dismissForegroundMessage,
  };
}
