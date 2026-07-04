import {
  Auth,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import {
  AuthGateway,
  AuthGatewayError,
  isDashboardRole,
  Session,
} from './auth-gateway';

const CREDENTIAL_ERROR_CODES = new Set([
  'auth/invalid-credential',
  'auth/wrong-password',
  'auth/user-not-found',
  'auth/invalid-email',
  'auth/user-disabled',
]);

function mapSignInError(error: unknown): AuthGatewayError {
  const code = (error as { code?: string })?.code ?? '';
  return CREDENTIAL_ERROR_CODES.has(code)
    ? new AuthGatewayError('invalid-credentials')
    : new AuthGatewayError('unavailable');
}

/**
 * The real AuthGateway over firebase/auth. A session exists only for a
 * non-anonymous user whose ID token carries an owner/admin role claim —
 * anonymous device sign-ins and unclaimed accounts resolve to null.
 */
export function createFirebaseAuthGateway(auth: Auth): AuthGateway {
  async function sessionFrom(user: User | null): Promise<Session | null> {
    if (!user || user.isAnonymous) return null;
    const token = await user.getIdTokenResult();
    const role = token.claims.role;
    if (!isDashboardRole(role)) return null;
    return { uid: user.uid, email: user.email, role };
  }

  return {
    async signIn(email, password) {
      let user: User;
      try {
        ({ user } = await signInWithEmailAndPassword(auth, email, password));
      } catch (error) {
        throw mapSignInError(error);
      }
      const session = await sessionFrom(user);
      if (!session) {
        // Signed in at Firebase level but not provisioned for the dashboard:
        // leave no session behind.
        await firebaseSignOut(auth);
        throw new AuthGatewayError('not-provisioned');
      }
    },

    async signOut() {
      await firebaseSignOut(auth);
    },

    observeSession(callback) {
      return onIdTokenChanged(auth, (user) => {
        void sessionFrom(user).then(callback);
      });
    },
  };
}
