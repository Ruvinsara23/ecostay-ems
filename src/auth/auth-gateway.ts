// The auth seam (PRD "Implementation Decisions"). UI code depends on this port only —
// never on the Firebase SDK directly. Roles come from Firebase custom claims (ADR-0005).

export type Role = 'admin' | 'owner' | 'device';

export type Session = {
  uid: string;
  email: string | null;
  role: Role;
};

export type AuthErrorCode = 'invalid-credentials' | 'not-provisioned' | 'unavailable';

export class AuthGatewayError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = 'AuthGatewayError';
  }
}

/** Only humans get a dashboard session; device credentials never do. */
export function isDashboardRole(role: unknown): role is 'owner' | 'admin' {
  return role === 'owner' || role === 'admin';
}

export interface AuthGateway {
  /**
   * Resolves on success. Rejects with AuthGatewayError:
   * 'invalid-credentials' for unknown email or wrong password,
   * 'not-provisioned' for accounts without an owner/admin role claim.
   * A failed sign-in must leave no session behind.
   */
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /**
   * Reports the current session (or null) to the callback immediately-or-soon,
   * then again on every change. Returns an unsubscribe function.
   */
  observeSession(callback: (session: Session | null) => void): () => void;
}
