import { Knex } from 'knex';
import { db } from '../../database/connection';

export interface SessionRecord {
  id: number;
  user_id: number;
  refresh_token_hash: string;
  expires_at: Date;
  is_revoked: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateSessionData {
  user_id: number;
  refresh_token_hash: string;
  expires_at: Date;
  ip_address?: string | null;
  user_agent?: string | null;
}

export interface ISessionRepository {
  createSession(data: CreateSessionData): Promise<SessionRecord>;
  findValidSession(tokenHash: string): Promise<SessionRecord | null>;
  revokeSession(tokenHash: string): Promise<boolean>;
  revokeAllUserSessions(userId: number): Promise<void>;
}

export class KnexSessionRepository implements ISessionRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  async createSession(data: CreateSessionData): Promise<SessionRecord> {
    const [insertedId] = await this.knexInstance('user_sessions').insert({
      user_id: data.user_id,
      refresh_token_hash: data.refresh_token_hash,
      expires_at: data.expires_at,
      is_revoked: false,
      ip_address: data.ip_address || null,
      user_agent: data.user_agent || null,
      created_at: this.knexInstance.fn.now(),
      updated_at: this.knexInstance.fn.now(),
    });

    const session = await this.knexInstance<SessionRecord>('user_sessions')
      .where({ id: insertedId })
      .first();

    if (!session) {
      throw new Error('Failed to retrieve session after creation');
    }
    return session;
  }

  async findValidSession(tokenHash: string): Promise<SessionRecord | null> {
    const now = new Date();
    const session = await this.knexInstance<SessionRecord>('user_sessions')
      .where({
        refresh_token_hash: tokenHash,
        is_revoked: false,
      })
      .andWhere('expires_at', '>', now)
      .first();

    return session || null;
  }

  async revokeSession(tokenHash: string): Promise<boolean> {
    const updated = await this.knexInstance('user_sessions')
      .where({ refresh_token_hash: tokenHash })
      .update({
        is_revoked: true,
        updated_at: this.knexInstance.fn.now(),
      });

    return updated > 0;
  }

  async revokeAllUserSessions(userId: number): Promise<void> {
    await this.knexInstance('user_sessions')
      .where({ user_id: userId })
      .update({
        is_revoked: true,
        updated_at: this.knexInstance.fn.now(),
      });
  }
}

export const sessionRepository: ISessionRepository = new KnexSessionRepository();
