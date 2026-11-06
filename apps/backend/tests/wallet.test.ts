import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { UsersController } from '../src/modules/users/users.controller';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { WalletController } from '../src/modules/wallet/wallet.controller';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
} from './mocks/in-memory-repositories';
import { generateTokens } from '../src/utils/jwt';

describe('Virtual Wallet & Double-Entry Ledger Module', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let walletService: WalletService;
  let authService: AuthService;
  let walletController: WalletController;
  let authController: AuthController;
  let usersController: UsersController;
  let app: any;

  // Pre-generated test tokens
  let traderTokens: any;
  let adminTokens: any;
  let secondTraderTokens: any;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();

    // In-memory Knex dummy for services that call withTransaction
    const mockKnex = {
      transaction: async (cb: any) => cb({}),
    } as any;

    walletService = new WalletService(walletRepo, ledgerRepo, mockKnex);
    authService = new AuthService(userRepo, sessionRepo, walletService);
    walletController = new WalletController(walletService);
    authController = new AuthController(authService);
    usersController = new UsersController(userRepo);

    app = createApp({
      authController,
      usersController,
      walletController,
      customCheckDb: async () => true,
    });

    // 1. Seed admin user (ID: 1)
    await userRepo.create({
      email: 'admin@tradegrid.internal',
      username: 'admin',
      password_hash: 'hash',
      role: 'ADMIN',
    });
    await walletService.createWalletForUser(1, '0.0000', 1);
    adminTokens = generateTokens({ id: 1, email: 'admin@tradegrid.internal', username: 'admin', role: 'ADMIN' });

    // 2. Seed primary trader user (ID: 2) with initial $100,000.0000
    await userRepo.create({
      email: 'trader@tradegrid.internal',
      username: 'trader1',
      password_hash: 'hash',
      role: 'TRADER',
    });
    await walletService.createWalletForUser(2, '100000.0000', 1);
    traderTokens = generateTokens({ id: 2, email: 'trader@tradegrid.internal', username: 'trader1', role: 'TRADER' });

    // 3. Seed secondary trader user (ID: 3)
    await userRepo.create({
      email: 'trader2@tradegrid.internal',
      username: 'trader2',
      password_hash: 'hash',
      role: 'TRADER',
    });
    await walletService.createWalletForUser(3, '500.0000', 1);
    secondTraderTokens = generateTokens({ id: 3, email: 'trader2@tradegrid.internal', username: 'trader2', role: 'TRADER' });
  });

  describe('Wallet Creation & Initial Balance', () => {
    it('should automatically create a virtual wallet when a user registers', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'new.trader@tradegrid.internal',
          username: 'new_trader',
          password: 'Password@123',
        });

      expect(res.status).toBe(201);
      const newUserId = res.body.data.user.id;

      // Verify wallet was created
      const wallet = await walletRepo.findByUserId(newUserId);
      expect(wallet).toBeDefined();
      expect(wallet?.available_balance).toBe('100000.0000');
      expect(wallet?.currency).toBe('USD');

      // Verify double-entry ledger transaction exists for initial grant
      const userAccount = await ledgerRepo.findOrCreateAccount('USER_WALLET', newUserId);
      const ledgerBalance = await ledgerRepo.calculateAccountBalanceFromLedger(userAccount.id);
      expect(ledgerBalance).toBe('100000.0000');
    });

    it('should prevent duplicate wallet creation for the same user', async () => {
      const existingWallet = await walletRepo.findByUserId(2);
      expect(existingWallet).toBeDefined();

      // Call createWalletForUser again
      const secondCall = await walletService.createWalletForUser(2, '100000.0000');
      expect(secondCall.id).toBe(existingWallet!.id);

      // Verify only 1 wallet exists for user 2
      const userWallets = walletRepo.wallets.filter((w) => w.user_id === 2);
      expect(userWallets.length).toBe(1);
    });
  });

  describe('GET /api/v1/wallet (View Wallet)', () => {
    it('should return wallet summary for authenticated trader', async () => {
      const res = await request(app)
        .get('/api/v1/wallet')
        .set('Authorization', `Bearer ${traderTokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.availableBalance).toBe('100000.0000');
      expect(res.body.data.currency).toBe('USD');
      expect(res.body.data.isConsistentWithLedger).toBe(true);
    });

    it('should reject unauthorized request without token (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/wallet');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/admin/wallets/:userId/credit (Admin Credit)', () => {
    it('should allow admin to credit virtual funds to trader with audit reason', async () => {
      const creditRes = await request(app)
        .post('/api/v1/admin/wallets/2/credit')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          amount: '25000.0000',
          reason: 'Competition winner prize virtual grant',
          idempotencyKey: 'prize-win-2026-user-2',
        });

      expect(creditRes.status).toBe(200);
      expect(creditRes.body.success).toBe(true);
      expect(creditRes.body.data.operation).toBe('CREDIT');
      expect(creditRes.body.data.amount).toBe('25000.0000');
      expect(creditRes.body.data.newBalance).toBe('125000.0000');

      // Verify materialized wallet updated
      const wallet = await walletRepo.findByUserId(2);
      expect(wallet?.available_balance).toBe('125000.0000');

      // Verify ledger consistency
      const userAccount = await ledgerRepo.findOrCreateAccount('USER_WALLET', 2);
      const ledgerBalance = await ledgerRepo.calculateAccountBalanceFromLedger(userAccount.id);
      expect(ledgerBalance).toBe('125000.0000');
    });

    it('should reject credit request from non-admin TRADER (403 Forbidden)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/wallets/2/credit')
        .set('Authorization', `Bearer ${traderTokens.accessToken}`)
        .send({
          amount: '5000.0000',
          reason: 'Attempted self grant',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should enforce idempotency: duplicate idempotencyKey returns same transaction without double crediting', async () => {
      const payload = {
        amount: '10000.0000',
        reason: 'One-time bonus stipend',
        idempotencyKey: 'idemp-bonus-12345',
      };

      // 1st request
      const res1 = await request(app)
        .post('/api/v1/admin/wallets/2/credit')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res1.body.data.newBalance).toBe('110000.0000');

      // 2nd identical request with same idempotency key
      const res2 = await request(app)
        .post('/api/v1/admin/wallets/2/credit')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send(payload);

      expect(res2.status).toBe(200);
      // Balance must NOT have increased twice
      const wallet = await walletRepo.findByUserId(2);
      expect(wallet?.available_balance).toBe('110000.0000');
    });
  });

  describe('POST /api/v1/admin/wallets/:userId/debit (Admin Debit)', () => {
    it('should allow admin to debit virtual funds from trader', async () => {
      const debitRes = await request(app)
        .post('/api/v1/admin/wallets/2/debit')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          amount: '20000.0000',
          reason: 'Virtual exchange fee clawback',
          idempotencyKey: 'debit-fee-user-2',
        });

      expect(debitRes.status).toBe(200);
      expect(debitRes.body.success).toBe(true);
      expect(debitRes.body.data.operation).toBe('DEBIT');
      expect(debitRes.body.data.newBalance).toBe('80000.0000');

      // Verify wallet updated
      const wallet = await walletRepo.findByUserId(2);
      expect(wallet?.available_balance).toBe('80000.0000');
    });

    it('should reject debit when trader has insufficient funds (422 Unprocessable Entity)', async () => {
      // User #3 only has $500.0000
      const debitRes = await request(app)
        .post('/api/v1/admin/wallets/3/debit')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          amount: '10000.0000', // Requesting more than $500 available
          reason: 'Excessive debit penalty',
        });

      expect(debitRes.status).toBe(422);
      expect(debitRes.body.success).toBe(false);
      expect(debitRes.body.error.code).toBe('INSUFFICIENT_FUNDS');

      // Balance must remain unchanged
      const wallet = await walletRepo.findByUserId(3);
      expect(wallet?.available_balance).toBe('500.0000');
    });

    it('should reject invalid or negative amounts (400 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/wallets/2/debit')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`)
        .send({
          amount: '-50.00', // Negative
          reason: 'Invalid negative test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Double-Entry Invariant & Financial Safety', () => {
    it('should ensure sum of Debits equals sum of Credits for every transaction', async () => {
      // Perform a series of credits and debits
      await walletService.creditUserWallet(1, 2, {
        amount: '1234.5678',
        reason: 'Test credit',
      });
      await walletService.debitUserWallet(1, 2, {
        amount: '500.0000',
        reason: 'Test debit',
      });

      // Verify across ALL transactions in the ledger
      for (const tx of ledgerRepo.transactions) {
        const txEntries = ledgerRepo.entries.filter((e) => e.ledger_transaction_id === tx.id);
        expect(txEntries.length).toBeGreaterThanOrEqual(2);

        let sumDebits = 0;
        let sumCredits = 0;
        for (const e of txEntries) {
          if (e.entry_type === 'DEBIT') sumDebits += parseFloat(e.amount);
          if (e.entry_type === 'CREDIT') sumCredits += parseFloat(e.amount);
        }

        expect(Math.abs(sumDebits - sumCredits)).toBeLessThan(0.0001);
      }
    });

    it('should reject transaction creation if debits and credits do not balance', async () => {
      await expect(
        ledgerRepo.createTransactionWithEntries(
          {
            transaction_reference: 'UNBALANCED-TX',
            transaction_type: 'SYSTEM_ADJUSTMENT',
            description: 'Unbalanced test',
          },
          [
            { account_id: 1, entry_type: 'DEBIT', amount: '100.0000' },
            { account_id: 2, entry_type: 'CREDIT', amount: '90.0000' }, // Off by 10!
          ]
        )
      ).rejects.toThrow(/Unbalanced/);
    });

    it('should maintain mathematical consistency between materialized wallet and ledger sum', async () => {
      await walletService.creditUserWallet(1, 2, { amount: '1500.0000', reason: 'P1' });
      await walletService.debitUserWallet(1, 2, { amount: '700.0000', reason: 'P2' });
      await walletService.creditUserWallet(1, 2, { amount: '350.2500', reason: 'P3' });

      const summary = await walletService.getWalletSummary(2);
      expect(summary.isConsistentWithLedger).toBe(true);

      const wallet = await walletRepo.findByUserId(2);
      const userAccount = await ledgerRepo.findOrCreateAccount('USER_WALLET', 2);
      const calculatedLedger = await ledgerRepo.calculateAccountBalanceFromLedger(userAccount.id);

      expect(wallet?.available_balance).toBe(calculatedLedger);
    });

    it('should handle simulated concurrent debit requests safely', async () => {
      // User #3 starts with $500.0000
      // Send two concurrent debit requests of $300 each (Total $600 > $500)
      // Only one can succeed; the second must be rejected with INSUFFICIENT_FUNDS
      const req1 = walletService.debitUserWallet(1, 3, { amount: '300.0000', reason: 'Debit 1' });
      const req2 = walletService.debitUserWallet(1, 3, { amount: '300.0000', reason: 'Debit 2' });

      const results = await Promise.allSettled([req1, req2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);

      // Remaining balance should be $200.0000
      const finalWallet = await walletRepo.findByUserId(3);
      expect(finalWallet?.available_balance).toBe('200.0000');
    });
  });

  describe('Transaction History & Pagination (GET /api/v1/wallet/transactions)', () => {
    beforeEach(async () => {
      // Perform 5 transactions on user 2
      for (let i = 1; i <= 5; i++) {
        await walletService.creditUserWallet(1, 2, {
          amount: `${i * 100}.0000`,
          reason: `Bonus tier ${i}`,
        });
      }
    });

    it('should return paginated transaction history sorted newest first', async () => {
      const res = await request(app)
        .get('/api/v1/wallet/transactions?page=1&limit=3')
        .set('Authorization', `Bearer ${traderTokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items.length).toBe(3);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(3);
      expect(res.body.data.pagination.total).toBe(6); // 1 initial grant + 5 credits = 6
      expect(res.body.data.pagination.totalPages).toBe(2);

      // Verify newest first: the last credit ($500) should be first
      expect(res.body.data.items[0].description).toBe('Bonus tier 5');
      expect(res.body.data.items[0].amount).toBe('500.0000');
      expect(res.body.data.items[0].direction).toBe('INFLOW');
    });

    it('should filter transaction history by transaction type', async () => {
      // Add a debit
      await walletService.debitUserWallet(1, 2, {
        amount: '50.0000',
        reason: 'Debit filter test',
      });

      const res = await request(app)
        .get('/api/v1/wallet/transactions?type=ADMIN_DEBIT')
        .set('Authorization', `Bearer ${traderTokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].transactionType).toBe('ADMIN_DEBIT');
      expect(res.body.data.items[0].direction).toBe('OUTFLOW');
    });
  });
});
