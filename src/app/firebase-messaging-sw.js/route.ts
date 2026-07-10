/**
 * Serves the FCM background service worker with the Firebase web config
 * injected from env — the same source of truth as src/firebase/app.ts —
 * instead of a hand-edited static file in /public (which drifted and shipped
 * REPLACE_WITH placeholders). Registered by getToken() at this exact path.
 */
export async function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
    // FCM is an optional slice: without its env the worker must not register.
    return new Response('// FCM is not configured for this deployment', { status: 404 });
  }

  const body = `importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(config)});

firebase.messaging().onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'EcoStay EMS Alert';
  self.registration.showNotification(title, {
    body: payload.notification && payload.notification.body,
  });
});
`;

  return new Response(body, {
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}
