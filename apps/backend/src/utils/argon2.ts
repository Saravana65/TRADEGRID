import argon2 from 'argon2';
import { config } from '../config/env';

/**
 * Hash a plain text password using Argon2id.
 * Argon2id combines Argon2d (data-dependent memory access) and Argon2i (data-independent memory access)
 * to resist both side-channel and GPU cracking attacks.
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  return argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: config.ARGON2_MEMORY_COST,
    timeCost: config.ARGON2_TIME_COST,
    parallelism: config.ARGON2_PARALLELISM,
  });
}

/**
 * Verify a plain text password against a stored Argon2id hash.
 */
export async function verifyPassword(hash: string, plainPassword: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plainPassword);
  } catch (error) {
    return false;
  }
}
