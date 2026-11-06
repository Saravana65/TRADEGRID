import { RegisterInput, LoginInput } from '@tradegrid/validation';
import { AuthResponse, RefreshResponse, User } from '@tradegrid/shared-types';
import { IUserRepository, userRepository } from '../users/user.repository';
import { ISessionRepository, sessionRepository } from './session.repository';
import { hashPassword, verifyPassword } from '../../utils/argon2';
import { generateTokens, verifyRefreshToken, hashToken } from '../../utils/jwt';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';

export class AuthService {
  constructor(
    private readonly userRepo: IUserRepository = userRepository,
    private readonly sessionRepo: ISessionRepository = sessionRepository
  ) {}

  /**
   * Register a new trader account
   */
  async register(
    input: RegisterInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResponse> {
    // 1. Check uniqueness of email
    const existingEmail = await this.userRepo.findByEmail(input.email);
    if (existingEmail) {
      throw new AppError(409, 'EMAIL_EXISTS', 'A user with this email address already exists');
    }

    // 2. Check uniqueness of username
    const existingUsername = await this.userRepo.findByUsername(input.username);
    if (existingUsername) {
      throw new AppError(409, 'USERNAME_EXISTS', 'This username is already taken');
    }

    // 3. Hash password using Argon2id
    const passwordHash = await hashPassword(input.password);

    // 4. Create user in database
    const userRecord = await this.userRepo.create({
      email: input.email,
      username: input.username,
      password_hash: passwordHash,
      role: 'TRADER',
      status: 'ACTIVE',
    });

    const user: User = {
      id: userRecord.id,
      email: userRecord.email,
      username: userRecord.username,
      role: userRecord.role,
      status: userRecord.status,
      createdAt: userRecord.created_at ? new Date(userRecord.created_at).toISOString() : new Date().toISOString(),
      updatedAt: userRecord.updated_at ? new Date(userRecord.updated_at).toISOString() : new Date().toISOString(),
    };

    // 5. Generate Access & Refresh Tokens
    const tokens = generateTokens(user);

    // 6. Persist Refresh Token Session (hashed)
    const tokenHash = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.sessionRepo.createSession({
      user_id: user.id,
      refresh_token_hash: tokenHash,
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    logger.info(`User registered successfully: ${user.username} (${user.email})`);

    return { user, tokens };
  }

  /**
   * Authenticate an existing user
   */
  async login(
    input: LoginInput,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResponse> {
    // 1. Fetch user by email
    const userRecord = await this.userRepo.findByEmail(input.email);
    if (!userRecord) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // 2. Verify password with Argon2id
    const isPasswordValid = await verifyPassword(userRecord.password_hash, input.password);
    if (!isPasswordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    // 3. Verify user status
    if (userRecord.status === 'SUSPENDED') {
      throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Your trading account has been suspended by an administrator');
    }

    const user: User = {
      id: userRecord.id,
      email: userRecord.email,
      username: userRecord.username,
      role: userRecord.role,
      status: userRecord.status,
      createdAt: userRecord.created_at ? new Date(userRecord.created_at).toISOString() : new Date().toISOString(),
      updatedAt: userRecord.updated_at ? new Date(userRecord.updated_at).toISOString() : new Date().toISOString(),
    };

    // 4. Generate Tokens
    const tokens = generateTokens(user);

    // 5. Persist Session with hashed refresh token
    const tokenHash = hashToken(tokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.sessionRepo.createSession({
      user_id: user.id,
      refresh_token_hash: tokenHash,
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    logger.info(`User logged in: ${user.username} (${user.email})`);

    return { user, tokens };
  }

  /**
   * Refresh an expired Access Token using a valid Refresh Token.
   * Performs Refresh Token Rotation: revokes old session, creates a new one.
   */
  async refresh(
    refreshTokenStr: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<RefreshResponse> {
    // 1. Verify token signature and expiration
    let payload;
    try {
      payload = verifyRefreshToken(refreshTokenStr);
    } catch {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired');
    }

    // 2. Check hashed token against active database sessions
    const tokenHash = hashToken(refreshTokenStr);
    const session = await this.sessionRepo.findValidSession(tokenHash);

    if (!session) {
      // Possible reuse attack: revoke all user sessions for safety
      await this.sessionRepo.revokeAllUserSessions(payload.sub);
      throw new AppError(401, 'SESSION_REVOKED', 'Session has been revoked or expired. Please log in again.');
    }

    // 3. Invalidate old session (token rotation)
    await this.sessionRepo.revokeSession(tokenHash);

    // 4. Verify user is still active
    const userRecord = await this.userRepo.findById(payload.sub);
    if (!userRecord || userRecord.status === 'SUSPENDED') {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'User account is inactive or suspended');
    }

    const user: User = {
      id: userRecord.id,
      email: userRecord.email,
      username: userRecord.username,
      role: userRecord.role,
      status: userRecord.status,
      createdAt: userRecord.created_at ? new Date(userRecord.created_at).toISOString() : new Date().toISOString(),
      updatedAt: userRecord.updated_at ? new Date(userRecord.updated_at).toISOString() : new Date().toISOString(),
    };

    // 5. Issue new tokens
    const newTokens = generateTokens(user);

    // 6. Save new session
    const newTokenHash = hashToken(newTokens.refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.sessionRepo.createSession({
      user_id: user.id,
      refresh_token_hash: newTokenHash,
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    return { tokens: newTokens };
  }

  /**
   * Logout user by invalidating the refresh token session
   */
  async logout(refreshTokenStr: string): Promise<void> {
    if (refreshTokenStr) {
      const tokenHash = hashToken(refreshTokenStr);
      await this.sessionRepo.revokeSession(tokenHash);
    }
  }

  /**
   * Get current authenticated user profile
   */
  async getProfile(userId: number): Promise<User> {
    const userRecord = await this.userRepo.findById(userId);
    if (!userRecord) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User profile not found');
    }

    return {
      id: userRecord.id,
      email: userRecord.email,
      username: userRecord.username,
      role: userRecord.role,
      status: userRecord.status,
      createdAt: userRecord.created_at ? new Date(userRecord.created_at).toISOString() : new Date().toISOString(),
      updatedAt: userRecord.updated_at ? new Date(userRecord.updated_at).toISOString() : new Date().toISOString(),
    };
  }
}

export const authService = new AuthService();
