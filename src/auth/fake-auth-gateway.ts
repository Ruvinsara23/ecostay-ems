import {
  AuthGateway,
  AuthGatewayError,
  isDashboardRole,
  Role,
  Session,
} from './auth-gateway';

type RegisteredUser = { email: string; password: string; role?: Role };

/**
 * In-memory AuthGateway for tests. Must stay behaviorally identical to the
 * Firebase adapter — both run the same contract suite (auth-gateway-contract.ts).
 */
export class FakeAuthGateway implements AuthGateway {
  private users = new Map<string, RegisteredUser>();
  private current: Session | null;
  private listeners = new Set<(session: Session | null) => void>();

  constructor(options?: { initialSession?: Session | null }) {
    this.current = options?.initialSession ?? null;
  }

  registerUser(user: RegisteredUser): void {
    this.users.set(user.email, user);
  }

  async signIn(email: string, password: string): Promise<void> {
    const user = this.users.get(email);
    if (!user || user.password !== password) {
      throw new AuthGatewayError('invalid-credentials');
    }
    if (!isDashboardRole(user.role)) {
      throw new AuthGatewayError('not-provisioned');
    }
    this.setSession({ uid: `fake-uid-${email}`, email, role: user.role });
  }

  async signOut(): Promise<void> {
    this.setSession(null);
  }

  observeSession(callback: (session: Session | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.current);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private setSession(session: Session | null): void {
    this.current = session;
    this.listeners.forEach((listener) => listener(session));
  }
}
