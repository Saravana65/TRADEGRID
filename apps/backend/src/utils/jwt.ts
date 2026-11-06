import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { AuthTokens, UserRole } from '@tradegrid/shared-types';
import { config } from '../config/env';

export interface TokenUserPayload {
  sub: number; // User ID
  email: string;
  username: string;
  role: UserRole;
  type: 'access' | 'refresh';
  jti?: string;
}

/**
 * Generate Access and Refresh JWT tokens for an authenticated user.
 */
export function generateTokens(user: {
  id: number;
  email: string;
  username: string;
  role: UserRole;
}): AuthTokens {
  const accessPayload: TokenUserPayload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    type: 'access',
  };

  const refreshPayload: TokenUserPayload = {
    sub: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    type: 'refresh',
    jti: crypto.randomUUID(),
  };

  // Sign access token with short TTL (e.g., 15m)
  const accessToken = jwt.sign(accessPayload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

  // Sign refresh token with longer TTL (e.g., 7d)
  const refreshToken = jwt.sign(refreshPayload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });

  // Expiration in seconds (default 15 minutes = 900 seconds)
  const expiresIn = 15 * 60;

  return {
    accessToken,
    refreshToken,
    expiresIn,
  };
}

/**
 * Verify and decode an Access Token.
 */
export function verifyAccessToken(token: string): TokenUserPayload {
  const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as unknown as TokenUserPayload;
  if (decoded.type !== 'access') {
    throw new Error('Invalid token type: expected access token');
  }
  return decoded;
}

/**
 * Verify and decode a Refresh Token.
 */
export function verifyRefreshToken(token: string): TokenUserPayload {
  const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as unknown as TokenUserPayload;
  if (decoded.type !== 'refresh') {
    throw new Error('Invalid token type: expected refresh token');
  }
  return decoded;
}

/**
 * Securely hashes a token (e.g. refresh token) using SHA-256 for database storage.
 * Storing only hashes of refresh tokens protects against database dump token reuse.
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
