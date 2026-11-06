import { z } from 'zod';

/**
 * User Registration Validation Schema
 */
export const registerSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Please provide a valid email address')
    .max(255, 'Email cannot exceed 255 characters')
    .trim()
    .toLowerCase(),
  username: z
    .string({ required_error: 'Username is required' })
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores')
    .trim(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * User Login Validation Schema
 */
export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email address')
    .trim()
    .toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password cannot be empty'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Refresh Token Validation Schema
 */
export const refreshTokenSchema = z.object({
  refreshToken: z
    .string({ required_error: 'Refresh token is required' })
    .min(1, 'Refresh token cannot be empty'),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

/**
 * User Status Update Schema (Admin only)
 */
export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED'], {
    errorMap: () => ({ message: 'Status must be ACTIVE or SUSPENDED' }),
  }),
});

export type UpdateUserStatusInput = z.infer<typeof updateUserStatusSchema>;

// ============================================================================
// Phase 2: Wallet & Ledger Validation Schemas
// ============================================================================

/**
 * Regex for standard financial decimal amounts:
 * Matches positive numbers with up to 4 decimal places, e.g. "100", "50.25", "1000.5000"
 */
const decimalAmountRegex = /^(?:[1-9]\d*|0)?(?:\.\d{1,4})?$/;

export const decimalAmountSchema = z
  .union([z.string(), z.number()])
  .transform((val) => (typeof val === 'number' ? val.toFixed(4) : val.trim()))
  .refine(
    (val) => decimalAmountRegex.test(val) && parseFloat(val) > 0,
    {
      message: 'Amount must be a positive decimal number with up to 4 decimal places (greater than 0)',
    }
  );

/**
 * Admin Wallet Adjustment Schema (Credit or Debit)
 */
export const adminWalletAdjustmentSchema = z.object({
  amount: decimalAmountSchema,
  reason: z
    .string({ required_error: 'Audit reason is required' })
    .min(3, 'Reason must be at least 3 characters long')
    .max(255, 'Reason cannot exceed 255 characters')
    .trim(),
  idempotencyKey: z
    .string()
    .max(128, 'Idempotency key cannot exceed 128 characters')
    .trim()
    .optional(),
});

export type AdminWalletAdjustmentInput = z.infer<typeof adminWalletAdjustmentSchema>;

/**
 * Wallet Transactions Query Schema
 */
export const walletTransactionsQuerySchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(String(val), 10) || 1) : 1)),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
  type: z
    .enum([
      'INITIAL_SIGNUP_GRANT',
      'ADMIN_CREDIT',
      'ADMIN_DEBIT',
      'SYSTEM_ADJUSTMENT',
      'TRADE_BUY',
      'TRADE_SELL',
      'FEE',
    ])
    .optional(),
  startDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  endDate: z.string().datetime({ offset: true }).optional().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
});

export type WalletTransactionsQueryInput = z.infer<typeof walletTransactionsQuerySchema>;
