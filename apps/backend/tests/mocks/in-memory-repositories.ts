import { UserRole, UserStatus } from '@tradegrid/shared-types';
import { IUserRepository, UserRecord, CreateUserData, SafeUserRecord } from '../../src/modules/users/user.repository';
import { ISessionRepository, SessionRecord, CreateSessionData } from '../../src/modules/auth/session.repository';

export class InMemoryUserRepository implements IUserRepository {
  private users: UserRecord[] = [];
  private nextId = 1;

  async findById(id: number): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.id === id);
    return user ? { ...user } : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return user ? { ...user } : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
    return user ? { ...user } : null;
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const record: UserRecord = {
      id: this.nextId++,
      email: data.email,
      username: data.username,
      password_hash: data.password_hash,
      role: data.role || 'TRADER',
      status: data.status || 'ACTIVE',
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.users.push(record);
    return { ...record };
  }

  async updateStatus(id: number, status: UserStatus): Promise<UserRecord | null> {
    const user = this.users.find((u) => u.id === id);
    if (!user) return null;
    user.status = status;
    user.updated_at = new Date();
    return { ...user };
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<SafeUserRecord[]> {
    return this.users
      .slice(offset, offset + limit)
      .map(({ password_hash, ...safe }) => safe);
  }

  clear(): void {
    this.users = [];
    this.nextId = 1;
  }
}

export class InMemorySessionRepository implements ISessionRepository {
  private sessions: SessionRecord[] = [];
  private nextId = 1;

  async createSession(data: CreateSessionData): Promise<SessionRecord> {
    const record: SessionRecord = {
      id: this.nextId++,
      user_id: data.user_id,
      refresh_token_hash: data.refresh_token_hash,
      expires_at: data.expires_at,
      is_revoked: false,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    this.sessions.push(record);
    return { ...record };
  }

  async findValidSession(tokenHash: string): Promise<SessionRecord | null> {
    const now = new Date();
    const session = this.sessions.find(
      (s) => s.refresh_token_hash === tokenHash && !s.is_revoked && s.expires_at > now
    );
    return session ? { ...session } : null;
  }

  async revokeSession(tokenHash: string): Promise<boolean> {
    const session = this.sessions.find((s) => s.refresh_token_hash === tokenHash);
    if (!session) return false;
    session.is_revoked = true;
    session.updated_at = new Date();
    return true;
  }

  async revokeAllUserSessions(userId: number): Promise<void> {
    for (const session of this.sessions) {
      if (session.user_id === userId) {
        session.is_revoked = true;
        session.updated_at = new Date();
      }
    }
  }

  clear(): void {
    this.sessions = [];
    this.nextId = 1;
  }
}
