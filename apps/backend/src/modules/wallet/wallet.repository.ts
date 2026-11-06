import { Knex } from 'knex';
import { db } from '../../database/connection';

export interface WalletRecord {
  id: number;
  user_id: number;
  currency: string;
  available_balance: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateWalletData {
  user_id: number;
  currency?: string;
  available_balance?: string;
}

export interface IWalletRepository {
  findByUserId(userId: number, trx?: Knex.Transaction): Promise<WalletRecord | null>;
  findById(id: number, trx?: Knex.Transaction): Promise<WalletRecord | null>;
  createWallet(data: CreateWalletData, trx?: Knex.Transaction): Promise<WalletRecord>;
  updateBalance(walletId: number, newBalance: string, trx?: Knex.Transaction): Promise<void>;
  lockWalletByUserId(userId: number, trx: Knex.Transaction): Promise<WalletRecord | null>;
}

export class KnexWalletRepository implements IWalletRepository {
  constructor(private readonly knexInstance: Knex = db) {}

  private getQueryBuilder(trx?: Knex.Transaction) {
    return trx ? trx<WalletRecord>('wallets') : this.knexInstance<WalletRecord>('wallets');
  }

  async findByUserId(userId: number, trx?: Knex.Transaction): Promise<WalletRecord | null> {
    const record = await this.getQueryBuilder(trx).where({ user_id: userId }).first();
    return record ? { ...record, available_balance: String(record.available_balance) } : null;
  }

  async findById(id: number, trx?: Knex.Transaction): Promise<WalletRecord | null> {
    const record = await this.getQueryBuilder(trx).where({ id }).first();
    return record ? { ...record, available_balance: String(record.available_balance) } : null;
  }

  async createWallet(data: CreateWalletData, trx?: Knex.Transaction): Promise<WalletRecord> {
    const qb = this.getQueryBuilder(trx);
    const balance = data.available_balance || '0.0000';
    const currency = data.currency || 'USD';

    const [insertedId] = await qb.insert({
      user_id: data.user_id,
      currency,
      available_balance: balance as any,
      created_at: (trx || this.knexInstance).fn.now(),
      updated_at: (trx || this.knexInstance).fn.now(),
    });

    const created = await this.findById(insertedId, trx);
    if (!created) {
      throw new Error('Failed to retrieve wallet after creation');
    }
    return created;
  }

  async updateBalance(walletId: number, newBalance: string, trx?: Knex.Transaction): Promise<void> {
    const qb = this.getQueryBuilder(trx);
    await qb.where({ id: walletId }).update({
      available_balance: newBalance as any,
      updated_at: (trx || this.knexInstance).fn.now(),
    });
  }

  /**
   * Acquires a pessimistic row-level exclusive lock on the user's wallet
   * within an active database transaction: SELECT ... FOR UPDATE
   */
  async lockWalletByUserId(userId: number, trx: Knex.Transaction): Promise<WalletRecord | null> {
    const record = await trx<WalletRecord>('wallets')
      .where({ user_id: userId })
      .forUpdate()
      .first();

    return record ? { ...record, available_balance: String(record.available_balance) } : null;
  }
}

export const walletRepository: IWalletRepository = new KnexWalletRepository();
