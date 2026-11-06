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

// ============================================================================
// Phase 3: Stock Instruments & Market Data Validation Schemas
// ============================================================================

/**
 * Symbol validation regex: 1-16 uppercase alphanumeric characters, allowing dots and hyphens
 */
export const symbolRegex = /^[A-Z0-9.\-_]{1,16}$/;

/**
 * Create Instrument Schema (Admin only)
 */
export const createInstrumentSchema = z.object({
  symbol: z
    .string({ required_error: 'Symbol is required' })
    .min(1, 'Symbol must be at least 1 character')
    .max(16, 'Symbol cannot exceed 16 characters')
    .transform((val) => val.trim().toUpperCase())
    .refine((val) => symbolRegex.test(val), {
      message: 'Symbol must be uppercase alphanumeric (e.g. RELIANCE, TGRID)',
    }),
  name: z
    .string({ required_error: 'Company name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(128, 'Name cannot exceed 128 characters')
    .trim(),
  exchange: z
    .string({ required_error: 'Exchange is required' })
    .min(1, 'Exchange must be at least 1 character')
    .max(16, 'Exchange cannot exceed 16 characters')
    .transform((val) => val.trim().toUpperCase()),
  sector: z
    .string({ required_error: 'Sector is required' })
    .min(2, 'Sector must be at least 2 characters')
    .max(64, 'Sector cannot exceed 64 characters')
    .trim(),
  instrumentType: z
    .enum(['EQUITY', 'INDEX', 'ETF'])
    .default('EQUITY'),
  currency: z
    .string()
    .length(3, 'Currency must be a 3-letter ISO code')
    .transform((val) => val.trim().toUpperCase())
    .default('USD'),
  marketStatus: z
    .enum(['ACTIVE', 'HALTED', 'SUSPENDED', 'DELISTED'])
    .default('ACTIVE'),
  dataClassification: z
    .enum(['REAL', 'SIMULATED'])
    .default('SIMULATED'),
});

export type CreateInstrumentInput = z.infer<typeof createInstrumentSchema>;

/**
 * Update Instrument Schema (Admin only)
 */
export const updateInstrumentSchema = z.object({
  name: z.string().min(2).max(128).trim().optional(),
  sector: z.string().min(2).max(64).trim().optional(),
  currency: z.string().length(3).transform((val) => val.trim().toUpperCase()).optional(),
  marketStatus: z.enum(['ACTIVE', 'HALTED', 'SUSPENDED', 'DELISTED']).optional(),
});

export type UpdateInstrumentInput = z.infer<typeof updateInstrumentSchema>;

/**
 * Update Instrument Status Schema (Admin only)
 */
export const updateInstrumentStatusSchema = z.object({
  marketStatus: z.enum(['ACTIVE', 'HALTED', 'SUSPENDED', 'DELISTED'], {
    required_error: 'Market status is required',
  }),
});

export type UpdateInstrumentStatusInput = z.infer<typeof updateInstrumentStatusSchema>;

/**
 * Instrument Filter Query Schema
 */
export const instrumentQuerySchema = z.object({
  q: z.string().trim().optional(),
  exchange: z.string().trim().transform((val) => val.toUpperCase()).optional(),
  sector: z.string().trim().optional(),
  classification: z.enum(['REAL', 'SIMULATED']).optional(),
  status: z.enum(['ACTIVE', 'HALTED', 'SUSPENDED', 'DELISTED']).optional(),
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(String(val), 10) || 1) : 1)),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 50)) : 50)),
});

export type InstrumentQueryInput = z.infer<typeof instrumentQuerySchema>;

/**
 * Candle Query Schema
 */
export const candleQuerySchema = z.object({
  interval: z
    .enum(['1m', '5m', '15m', '1h', '1d'], {
      errorMap: () => ({ message: 'Interval must be one of: 1m, 5m, 15m, 1h, 1d' }),
    })
    .default('1h'),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(1000, Math.max(1, parseInt(String(val), 10) || 100)) : 100)),
});

export type CandleQueryInput = z.infer<typeof candleQuerySchema>;

// ============================================================================
// Phase 4A: Order Validation Schemas
// ============================================================================

/**
 * Create Order Schema
 */
export const createOrderSchema = z
  .object({
    instrumentId: z
      .union([z.string(), z.number()], { required_error: 'Instrument ID is required' })
      .transform((val) => (typeof val === 'number' ? val : parseInt(val, 10)))
      .refine((val) => !isNaN(val) && val > 0, {
        message: 'Instrument ID must be a positive integer',
      }),
    side: z.enum(['BUY', 'SELL'], {
      errorMap: () => ({ message: 'Side must be either BUY or SELL' }),
    }),
    orderType: z.enum(['MARKET', 'LIMIT'], {
      errorMap: () => ({ message: 'Order type must be either MARKET or LIMIT' }),
    }),
    quantity: decimalAmountSchema,
    limitPrice: z
      .union([z.string(), z.number()])
      .optional()
      .nullable()
      .transform((val) => {
        if (val === undefined || val === null || val === '') return null;
        return typeof val === 'number' ? val.toFixed(4) : String(val).trim();
      }),
    idempotencyKey: z
      .string()
      .max(128, 'Idempotency key cannot exceed 128 characters')
      .trim()
      .optional()
      .nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.orderType === 'LIMIT') {
      if (!data.limitPrice) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['limitPrice'],
          message: 'Limit price is required for LIMIT orders',
        });
      } else {
        const num = parseFloat(data.limitPrice);
        if (isNaN(num) || num <= 0 || !decimalAmountRegex.test(data.limitPrice)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['limitPrice'],
            message: 'Limit price must be a positive decimal number with up to 4 decimal places (greater than 0)',
          });
        }
      }
    }
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/**
 * Order Query Schema
 */
export const orderQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED'])
    .optional(),
  side: z.enum(['BUY', 'SELL']).optional(),
  orderType: z.enum(['MARKET', 'LIMIT']).optional(),
  instrumentId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? parseInt(String(val), 10) : undefined)),
  symbol: z.string().trim().optional(),
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(String(val), 10) || 1) : 1)),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
});

export type OrderQueryInput = z.infer<typeof orderQuerySchema>;

/**
 * Order ID Param Schema
 */
export const orderIdParamSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: 'Order ID must be a positive integer',
    }),
});

export type OrderIdParamInput = z.infer<typeof orderIdParamSchema>;

// ============================================================================
// Phase 4B: Trades, Order Book, and Portfolio Validation Schemas
// ============================================================================

export const tradeQuerySchema = z.object({
  symbol: z.string().trim().optional(),
  instrumentId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? parseInt(String(val), 10) : undefined)),
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(String(val), 10) || 1) : 1)),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type TradeQueryInput = z.infer<typeof tradeQuerySchema>;

export const orderBookQuerySchema = z.object({
  depth: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(50, Math.max(1, parseInt(String(val), 10) || 10)) : 10)),
});

export type OrderBookQueryInput = z.infer<typeof orderBookQuerySchema>;

export const portfolioQuerySchema = z.object({
  exchange: z.string().trim().optional(),
});

export type PortfolioQueryInput = z.infer<typeof portfolioQuerySchema>;

