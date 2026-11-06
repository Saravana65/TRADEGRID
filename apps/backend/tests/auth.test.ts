import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthController } from '../src/modules/auth/auth.controller';
import { UsersController } from '../src/modules/users/users.controller';
import { WalletService } from '../src/modules/wallet/wallet.service';
import {
  InMemoryUserRepository,
  InMemorySessionRepository,
  InMemoryWalletRepository,
  InMemoryLedgerRepository,
} from './mocks/in-memory-repositories';
import { generateTokens } from '../src/utils/jwt';

describe('Authentication & Authorization Module', () => {
  let userRepo: InMemoryUserRepository;
  let sessionRepo: InMemorySessionRepository;
  let walletRepo: InMemoryWalletRepository;
  let ledgerRepo: InMemoryLedgerRepository;
  let walletService: WalletService;
  let authService: AuthService;
  let authController: AuthController;
  let usersController: UsersController;
  let app: any;

  beforeEach(() => {
    userRepo = new InMemoryUserRepository();
    sessionRepo = new InMemorySessionRepository();
    walletRepo = new InMemoryWalletRepository();
    ledgerRepo = new InMemoryLedgerRepository();

    const mockKnex = {
      transaction: async (cb: any) => cb({}),
    } as any;

    walletService = new WalletService(walletRepo, ledgerRepo, mockKnex);
    authService = new AuthService(userRepo, sessionRepo, walletService);
    authController = new AuthController(authService);
    usersController = new UsersController(userRepo);

    app = createApp({
      authController,
      usersController,
      customCheckDb: async () => true,
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it('should successfully register a new trader account', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'alex.trader@tradegrid.internal',
          username: 'alex_trader',
          password: 'Password@123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('alex.trader@tradegrid.internal');
      expect(res.body.data.user.username).toBe('alex_trader');
      expect(res.body.data.user.role).toBe('TRADER');
      expect(res.body.data.user.status).toBe('ACTIVE');
      // CRITICAL: password hash must NEVER be exposed in API responses
      expect(res.body.data.user.password_hash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();

      expect(res.body.data.tokens).toBeDefined();
      expect(typeof res.body.data.tokens.accessToken).toBe('string');
      expect(typeof res.body.data.tokens.refreshToken).toBe('string');
      expect(res.body.data.tokens.expiresIn).toBe(900);
    });

    it('should reject registration when email is already in use (409 Conflict)', async () => {
      // First registration
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@tradegrid.internal',
          username: 'trader_one',
          password: 'Password@123',
        });

      // Second registration with same email
      const duplicateRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'duplicate@tradegrid.internal',
          username: 'trader_two',
          password: 'Password@123',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.success).toBe(false);
      expect(duplicateRes.body.error.code).toBe('EMAIL_EXISTS');
    });

    it('should reject registration when username is already in use (409 Conflict)', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'first@tradegrid.internal',
          username: 'unique_handle',
          password: 'Password@123',
        });

      const duplicateUsernameRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'second@tradegrid.internal',
          username: 'unique_handle',
          password: 'Password@123',
        });

      expect(duplicateUsernameRes.status).toBe(409);
      expect(duplicateUsernameRes.body.success).toBe(false);
      expect(duplicateUsernameRes.body.error.code).toBe('USERNAME_EXISTS');
    });

    it('should reject registration with invalid email or weak password (400 Validation Error)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'not-an-email',
          username: 'ab', // too short (< 3)
          password: 'weak', // too short, no uppercase, no number
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    beforeEach(async () => {
      // Seed a user for login testing
      await authService.register({
        email: 'trader.login@tradegrid.internal',
        username: 'trader_login',
        password: 'SecurePassword@123',
      });
    });

    it('should authenticate user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'trader.login@tradegrid.internal',
          password: 'SecurePassword@123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('trader.login@tradegrid.internal');
      expect(res.body.data.tokens.accessToken).toBeDefined();
      expect(res.body.data.tokens.refreshToken).toBeDefined();
    });

    it('should reject login with incorrect password (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'trader.login@tradegrid.internal',
          password: 'WrongPassword@999',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });

    it('should reject login for non-existent email (401 Unauthorized)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'ghost@tradegrid.internal',
          password: 'Password@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('Protected Routes & Authorization (GET /api/v1/auth/me)', () => {
    it('should allow access to /me with valid JWT token', async () => {
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'protected.test@tradegrid.internal',
          username: 'protected_user',
          password: 'Password@123',
        });

      const token = registerRes.body.data.tokens.accessToken;

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.user.email).toBe('protected.test@tradegrid.internal');
      expect(meRes.body.data.user.username).toBe('protected_user');
    });

    it('should reject access to /me without token (401 Unauthorized)', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject access to /me with forged/tampered token (401 Unauthorized)', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer forged.invalid.token');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('Token Refresh Rotation & Session Revocation', () => {
    it('should issue new access and refresh tokens via /refresh', async () => {
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'refresh.test@tradegrid.internal',
          username: 'refresh_user',
          password: 'Password@123',
        });

      const originalRefreshToken = registerRes.body.data.tokens.refreshToken;

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.tokens.accessToken).toBeDefined();
      expect(refreshRes.body.data.tokens.refreshToken).toBeDefined();
      // Ensure refresh token was rotated
      expect(refreshRes.body.data.tokens.refreshToken).not.toBe(originalRefreshToken);

      // Reusing the old refresh token must fail because it was rotated (revoked)
      const reusedRes = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: originalRefreshToken });

      expect(reusedRes.status).toBe(401);
    });

    it('should revoke session on logout', async () => {
      const registerRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'logout.test@tradegrid.internal',
          username: 'logout_user',
          password: 'Password@123',
        });

      const refreshToken = registerRes.body.data.tokens.refreshToken;

      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .send({ refreshToken });

      expect(logoutRes.status).toBe(200);

      // Refreshing with logged out token must fail
      const refreshAfterLogout = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken });

      expect(refreshAfterLogout.status).toBe(401);
    });
  });

  describe('Role-Based Authorization (RBAC)', () => {
    it('should reject TRADER role from accessing ADMIN endpoint /api/v1/users (403 Forbidden)', async () => {
      const traderTokens = generateTokens({
        id: 10,
        email: 'trader@tradegrid.internal',
        username: 'trader10',
        role: 'TRADER',
      });

      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${traderTokens.accessToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should allow ADMIN role to access /api/v1/users (200 OK)', async () => {
      const adminTokens = generateTokens({
        id: 1,
        email: 'admin@tradegrid.internal',
        username: 'admin',
        role: 'ADMIN',
      });

      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminTokens.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.users)).toBe(true);
    });
  });
});
