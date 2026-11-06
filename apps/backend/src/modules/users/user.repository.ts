import { Knex } from 'knex';
import { UserRole, UserStatus } from '@tradegrid/shared-types';
import { db } from '../../database/connection';

export interface UserRecord {
  id: number;
  email: string;
  username: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
}

export type SafeUserRecord = Omit<UserRecord, 'password_hash'>;

export interface CreateUserData {
  email: string;
  username: string;
  password_hash: string;
  role?: UserRole;
  status?: UserStatus;
}

export interface IUserRepository {
  findById(id: number): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  create(data: CreateUserData): Promise<UserRecord>;
  updateStatus(id: number, status: UserStatus): Promise<UserRecord | null>;
  findAll(limit?: number, offset?: number): Promise<SafeUserRecord[]>;
}

export class KnexUserRepository implements IUserRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  async findById(id: number): Promise<UserRecord | null> {
    const user = await this.knexInstance<UserRecord>('users').where({ id }).first();
    return user || null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.knexInstance<UserRecord>('users').where({ email }).first();
    return user || null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const user = await this.knexInstance<UserRecord>('users').where({ username }).first();
    return user || null;
  }

  async create(data: CreateUserData): Promise<UserRecord> {
    const [insertedId] = await this.knexInstance('users').insert({
      email: data.email,
      username: data.username,
      password_hash: data.password_hash,
      role: data.role || 'TRADER',
      status: data.status || 'ACTIVE',
      created_at: this.knexInstance.fn.now(),
      updated_at: this.knexInstance.fn.now(),
    });

    const created = await this.findById(insertedId);
    if (!created) {
      throw new Error('Failed to retrieve user after insertion');
    }
    return created;
  }

  async updateStatus(id: number, status: UserStatus): Promise<UserRecord | null> {
    await this.knexInstance('users').where({ id }).update({
      status,
      updated_at: this.knexInstance.fn.now(),
    });
    return this.findById(id);
  }

  async findAll(limit: number = 50, offset: number = 0): Promise<SafeUserRecord[]> {
    return this.knexInstance<SafeUserRecord>('users')
      .select('id', 'email', 'username', 'role', 'status', 'created_at', 'updated_at')
      .limit(limit)
      .offset(offset)
      .orderBy('id', 'asc');
  }
}

export const userRepository: IUserRepository = new KnexUserRepository();
