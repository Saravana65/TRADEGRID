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

// ============================================================================
// Phase 5A: WebSocket Subscription Validation Schema
// ============================================================================

export const subscriptionSchema = z.object({
  channel: z
    .string()
    .trim()
    .min(3, 'Channel name is too short')
    .max(64, 'Channel name is too long')
    .regex(
      /^(market|orderbook|trades|competition):[A-Za-z0-9_-]+$|^user:\d+$|^(admin:bots|news|admin:news|chat:global)$|^chat:(symbol:[A-Za-z0-9_-]+|conversation:\d+)$/,
      'Channel must be in format "market:SYMBOL", "orderbook:SYMBOL", "trades:SYMBOL", "user:USER_ID", "competition:ID", "chat:global", "chat:symbol:SYMBOL", "chat:conversation:ID", "admin:bots", "news", or "admin:news"'
    ),
});

export type SubscriptionInput = z.infer<typeof subscriptionSchema>;

// ============================================================================
// Phase 5B: Autonomous Market-Making Bots Validation Schemas
// ============================================================================

export const botStrategyTypeSchema = z.enum([
  'CONSERVATIVE_MM',
  'BALANCED_MM',
  'AGGRESSIVE_LP',
  'RANDOM_LIQUIDITY',
]);

export const botConfigurationSchema = z.object({
  quoteRefreshIntervalMs: z
    .number()
    .int()
    .min(500, 'Quote refresh interval must be at least 500ms')
    .max(60000, 'Quote refresh interval cannot exceed 60000ms')
    .optional(),
  spreadBps: z
    .number()
    .min(1, 'Spread must be at least 1 basis point')
    .max(2000, 'Spread cannot exceed 2000 basis points')
    .optional(),
  orderQuantity: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, 'Order quantity must be a positive decimal with up to 4 decimal places')
    .refine((val) => parseFloat(val) > 0, 'Order quantity must be greater than 0')
    .optional(),
  maxOrderQuantity: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((val) => parseFloat(val) > 0)
    .optional(),
  maxOrderNotional: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((val) => parseFloat(val) > 0)
    .optional(),
  maxInventoryPerInstrument: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((val) => parseFloat(val) >= 0)
    .optional(),
  maxTotalExposure: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((val) => parseFloat(val) > 0)
    .optional(),
  maxOpenOrders: z.number().int().min(1).max(50).optional(),
  maxDailyLoss: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .refine((val) => parseFloat(val) > 0)
    .optional(),
  skewFactor: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
});

export const createBotSchema = z.object({
  name: z
    .string({ required_error: 'Bot name is required' })
    .trim()
    .min(3, 'Bot name must be at least 3 characters')
    .max(50, 'Bot name cannot exceed 50 characters')
    .regex(/^[a-zA-Z0-9_\-\s]+$/, 'Bot name may only contain alphanumeric characters, hyphens, and underscores'),
  strategyType: botStrategyTypeSchema,
  allocatedCapital: z
    .string({ required_error: 'Allocated virtual capital is required' })
    .regex(/^\d+(\.\d{1,4})?$/, 'Allocated capital must be a valid positive amount')
    .refine((val) => parseFloat(val) >= 1000, 'Allocated capital must be at least $1,000.0000'),
  instrumentIds: z
    .array(z.number().int().positive())
    .min(1, 'At least one instrument must be assigned to the bot'),
  initialInventoryShares: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional()
    .default('100.0000'),
  configuration: botConfigurationSchema.optional(),
});

export type CreateBotInput = z.infer<typeof createBotSchema>;

export const updateBotSchema = z.object({
  name: z.string().trim().min(3).max(50).optional(),
  strategyType: botStrategyTypeSchema.optional(),
  instrumentIds: z.array(z.number().int().positive()).min(1).optional(),
  configuration: botConfigurationSchema.optional(),
});

export type UpdateBotInput = z.infer<typeof updateBotSchema>;

export const botIdParamSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => !isNaN(val) && val > 0, 'Invalid bot ID parameter'),
});

export type BotIdParamInput = z.infer<typeof botIdParamSchema>;

export const botLogQuerySchema = z.object({
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(String(val), 10) || 1) : 1)),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
  status: z.enum(['SUCCESS', 'WARNING', 'FAILURE']).optional(),
  action: z.string().optional(),
});

export type BotLogQueryInput = z.infer<typeof botLogQuerySchema>;

// ============================================================================
// Phase 5C: Simulated News Catalyst Engine Validation Schemas
// ============================================================================

export const newsCategorySchema = z.enum([
  'Earnings',
  'Revenue',
  'Management',
  'Product Launch',
  'Partnership',
  'Regulatory',
  'Legal',
  'Economic',
  'Industry',
  'Competition',
  'Crisis',
  'Market Sentiment',
  'Other',
]);

export const newsImpactDirectionSchema = z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']);

export const newsSeveritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'EXTREME']);

export const newsTargetScopeSchema = z.enum(['INSTRUMENT', 'SECTOR', 'MARKET']);

export const newsStatusSchema = z.enum([
  'DRAFT',
  'SCHEDULED',
  'PUBLISHED',
  'ACTIVE',
  'EXPIRED',
  'CANCELLED',
]);

export const catalystConfigSchema = z.object({
  sentimentScore: z
    .string()
    .regex(/^-?\d+(\.\d{1,4})?$/, 'Sentiment score must be a decimal between -1.0000 and +1.0000')
    .refine((v) => Math.abs(parseFloat(v)) <= 1.0, 'Sentiment score must be between -1.0000 and +1.0000')
    .optional(),
  volatilityFactor: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/, 'Volatility factor must be a positive decimal')
    .refine((v) => parseFloat(v) >= 1.0 && parseFloat(v) <= 10.0, 'Volatility factor must be between 1.0 and 10.0')
    .optional(),
  expectedParticipation: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
  durationSeconds: z
    .number()
    .int()
    .min(10, 'Catalyst duration must be at least 10 seconds')
    .max(86400, 'Catalyst duration cannot exceed 24 hours')
    .optional(),
  decayRate: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .optional(),
});

export const createNewsSchema = z
  .object({
    headline: z
      .string({ required_error: 'News headline is required' })
      .trim()
      .min(5, 'Headline must be at least 5 characters')
      .max(255, 'Headline cannot exceed 255 characters'),
    summary: z
      .string({ required_error: 'News summary is required' })
      .trim()
      .min(10, 'Summary must be at least 10 characters')
      .max(2000, 'Summary cannot exceed 2000 characters'),
    content: z.string().trim().max(10000).optional(),
    category: newsCategorySchema,
    impactDirection: newsImpactDirectionSchema,
    severity: newsSeveritySchema,
    targetScope: newsTargetScopeSchema,
    targetId: z.string().trim().optional(),
    targetSymbol: z.string().trim().max(16).optional(),
    targetSector: z.string().trim().max(64).optional(),
    scheduledAt: z.string().datetime().optional().nullable(),
    publishImmediately: z.boolean().optional(),
    catalyst: catalystConfigSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.targetScope === 'INSTRUMENT' && !data.targetSymbol && !data.targetId) {
        return false;
      }
      if (data.targetScope === 'SECTOR' && !data.targetSector && !data.targetId) {
        return false;
      }
      return true;
    },
    {
      message: 'targetSymbol is required for INSTRUMENT scope, targetSector is required for SECTOR scope',
    }
  );

export type CreateNewsInput = z.infer<typeof createNewsSchema>;

export const updateNewsSchema = z.object({
  headline: z.string().trim().min(5).max(255).optional(),
  summary: z.string().trim().min(10).max(2000).optional(),
  content: z.string().trim().max(10000).optional(),
  category: newsCategorySchema.optional(),
  impactDirection: newsImpactDirectionSchema.optional(),
  severity: newsSeveritySchema.optional(),
  targetScope: newsTargetScopeSchema.optional(),
  targetId: z.string().trim().optional(),
  targetSymbol: z.string().trim().max(16).optional(),
  targetSector: z.string().trim().max(64).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
  catalyst: catalystConfigSchema.optional(),
});

export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;

export const scheduleNewsSchema = z.object({
  scheduledAt: z.string().datetime('scheduledAt must be a valid ISO 8601 datetime string'),
});

export type ScheduleNewsInput = z.infer<typeof scheduleNewsSchema>;

export const newsIdParamSchema = z.object({
  id: z
    .union([z.string(), z.number()])
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => !isNaN(val) && val > 0, 'Invalid news article ID'),
});

export type NewsIdParamInput = z.infer<typeof newsIdParamSchema>;

export const newsQuerySchema = z.object({
  category: newsCategorySchema.optional(),
  impactDirection: newsImpactDirectionSchema.optional(),
  severity: newsSeveritySchema.optional(),
  targetScope: newsTargetScopeSchema.optional(),
  targetSymbol: z.string().trim().optional(),
  targetSector: z.string().trim().optional(),
  status: newsStatusSchema.optional(),
  search: z.string().trim().optional(),
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(String(val), 10) || 1) : 1)),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
});

export type NewsQueryInput = z.infer<typeof newsQuerySchema>;

// ============================================================================
// Phase 5D: Multiplayer Trading Competitions & Leaderboards Schemas
// ============================================================================

export const competitionStatusSchema = z.enum([
  'DRAFT',
  'UPCOMING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
]);

export const competitionVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);

export const createCompetitionSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(3, 'Competition name must be at least 3 characters')
      .max(128, 'Competition name cannot exceed 128 characters'),
    description: z
      .string()
      .trim()
      .max(2000, 'Description cannot exceed 2000 characters')
      .default(''),
    visibility: competitionVisibilitySchema.default('PUBLIC'),
    joinCode: z
      .string()
      .trim()
      .max(32, 'Join code cannot exceed 32 characters')
      .optional()
      .nullable(),
    startingCapital: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, 'Starting capital must be a positive decimal with up to 4 decimal places')
      .refine((val) => parseFloat(val) >= 1000, 'Starting capital must be at least ₹1,000')
      .default('100000.0000'),
    maxParticipants: z
      .number()
      .int()
      .min(2, 'Maximum participants must be at least 2')
      .max(1000, 'Maximum participants cannot exceed 1000')
      .default(100),
    minParticipants: z
      .number()
      .int()
      .min(2, 'Minimum participants must be at least 2')
      .max(500, 'Minimum participants cannot exceed 500')
      .default(2),
    startTime: z.string().datetime('Start time must be a valid ISO 8601 datetime string'),
    endTime: z.string().datetime('End time must be a valid ISO 8601 datetime string'),
    allowedInstruments: z.array(z.string().trim().toUpperCase()).optional().nullable(),
    permittedOrderTypes: z
      .array(z.enum(['LIMIT', 'MARKET']))
      .min(1, 'At least one order type must be permitted')
      .default(['LIMIT', 'MARKET']),
  })
  .refine(
    (data) => new Date(data.endTime).getTime() > new Date(data.startTime).getTime(),
    {
      message: 'End time must be strictly after start time',
      path: ['endTime'],
    }
  )
  .refine(
    (data) => {
      if (data.visibility === 'PRIVATE' && (!data.joinCode || data.joinCode.trim().length === 0)) {
        return false;
      }
      return true;
    },
    {
      message: 'Join code is required for private competitions',
      path: ['joinCode'],
    }
  );

export type CreateCompetitionInput = z.infer<typeof createCompetitionSchema>;

export const joinCompetitionSchema = z.object({
  joinCode: z.string().trim().max(32).optional().nullable(),
});

export type JoinCompetitionInput = z.infer<typeof joinCompetitionSchema>;

export const createCompetitionOrderSchema = z
  .object({
    instrumentId: z
      .union([z.string(), z.number()])
      .transform((val) => parseInt(String(val), 10))
      .refine((val) => !isNaN(val) && val > 0, 'Valid instrument ID required'),
    side: z.enum(['BUY', 'SELL']),
    orderType: z.enum(['LIMIT', 'MARKET']),
    quantity: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, 'Quantity must be a positive decimal with up to 4 decimal places')
      .refine((val) => parseFloat(val) > 0, 'Quantity must be greater than zero'),
    limitPrice: z
      .string()
      .regex(/^\d+(\.\d{1,4})?$/, 'Limit price must be a positive decimal with up to 4 decimal places')
      .optional()
      .nullable(),
    idempotencyKey: z.string().trim().max(64).optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.orderType === 'LIMIT') {
        return !!data.limitPrice && parseFloat(data.limitPrice) > 0;
      }
      return true;
    },
    {
      message: 'Limit price is required for LIMIT orders',
      path: ['limitPrice'],
    }
  );

export type CreateCompetitionOrderInput = z.infer<typeof createCompetitionOrderSchema>;

export const competitionQuerySchema = z.object({
  status: competitionStatusSchema.optional(),
  visibility: competitionVisibilitySchema.optional(),
  search: z.string().trim().optional(),
  page: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.max(1, parseInt(String(val), 10) || 1) : 1)),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
});

export type CompetitionQueryInput = z.infer<typeof competitionQuerySchema>;

// ============================================================================
// Phase 5E: Global Trader Chat, Symbol Rooms & Direct Messaging Schemas
// ============================================================================

export const chatRoomTypeSchema = z.enum(['GLOBAL', 'SYMBOL']);

export const sendChatMessageSchema = z.object({
  content: z
    .string({ required_error: 'Message content is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message cannot exceed 1000 characters'),
  idempotencyKey: z.string().trim().max(64).optional().nullable(),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;

export const sendDirectMessageSchema = z.object({
  recipientId: z
    .union([z.string(), z.number()])
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => !isNaN(val) && val > 0, 'Valid recipient ID is required'),
  content: z
    .string({ required_error: 'Message content is required' })
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message cannot exceed 1000 characters'),
  idempotencyKey: z.string().trim().max(64).optional().nullable(),
});

export type SendDirectMessageInput = z.infer<typeof sendDirectMessageSchema>;

export const chatPaginationQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 50)) : 50)),
  beforeId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? parseInt(String(val), 10) : undefined)),
  afterId: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? parseInt(String(val), 10) : undefined)),
});

export type ChatPaginationQueryInput = z.infer<typeof chatPaginationQuerySchema>;

export const userSearchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(1, 'Search query must be at least 1 character')
    .max(64, 'Search query cannot exceed 64 characters'),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(50, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
});

export type UserSearchQueryInput = z.infer<typeof userSearchQuerySchema>;

export const createBlockSchema = z.object({
  userId: z
    .union([z.string(), z.number()])
    .transform((val) => parseInt(String(val), 10))
    .refine((val) => !isNaN(val) && val > 0, 'Valid user ID is required'),
  reason: z.string().trim().max(255).optional().nullable(),
});

export type CreateBlockInput = z.infer<typeof createBlockSchema>;

export const chatReportReasonSchema = z.enum([
  'SPAM',
  'HARASSMENT',
  'MANIPULATION',
  'OFFENSIVE',
  'OTHER',
]);

export const createReportSchema = z.object({
  reportedUserId: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((val) => (val ? parseInt(String(val), 10) : undefined)),
  messageId: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((val) => (val ? parseInt(String(val), 10) : undefined)),
  reason: chatReportReasonSchema,
  description: z.string().trim().max(1000).optional().nullable(),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const reviewReportSchema = z.object({
  status: z.enum(['REVIEWED', 'DISMISSED', 'ACTIONED']),
  action: z.enum(['NONE', 'DELETE_MESSAGE', 'WARN_USER', 'RESTRICT_USER']).default('NONE'),
});

export type ReviewReportInput = z.infer<typeof reviewReportSchema>;

// ============================================================================
// Phase 6: Strategy Backtesting & Quantitative Research Schemas
// ============================================================================

export const quantitativeStrategyTypeSchema = z.enum([
  'SMA_CROSSOVER',
  'EMA_CROSSOVER',
  'RSI_MOMENTUM',
  'MACD_TREND',
  'BOLLINGER_REVERSION',
  'BREAKOUT',
]);

export const positionSizingTypeSchema = z.enum([
  'FIXED_PERCENT',
  'FIXED_QUANTITY',
  'FIXED_AMOUNT',
]);

export const runBacktestSchema = z.object({
  symbol: z.string().trim().min(1, 'Symbol is required').max(16),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('1d'),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  strategyType: quantitativeStrategyTypeSchema,
  strategyParams: z.record(z.union([z.number(), z.string(), z.boolean()])).default({}),
  initialCapital: z
    .number()
    .min(1000, 'Initial capital must be at least $1,000')
    .max(10000000, 'Initial capital cannot exceed $10,000,000')
    .default(100000),
  positionSizing: z
    .object({
      type: positionSizingTypeSchema.default('FIXED_PERCENT'),
      value: z.number().min(0.01).max(1000000).default(25),
    })
    .default({ type: 'FIXED_PERCENT', value: 25 }),
  stopLossPercent: z.number().min(0.1).max(50).optional().nullable(),
  takeProfitPercent: z.number().min(0.1).max(200).optional().nullable(),
  slippagePercent: z.number().min(0).max(5).default(0.05),
  commissionPercent: z.number().min(0).max(5).default(0.1),
  includeAIAnalysis: z.boolean().default(true),
});

export type RunBacktestInput = z.infer<typeof runBacktestSchema>;

export const compareStrategiesSchema = z.object({
  symbol: z.string().trim().min(1, 'Symbol is required').max(16),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('1d'),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  initialCapital: z.number().min(1000).max(10000000).default(100000),
  strategies: z.array(quantitativeStrategyTypeSchema).min(2).max(6).default([
    'SMA_CROSSOVER',
    'EMA_CROSSOVER',
    'RSI_MOMENTUM',
    'MACD_TREND',
    'BOLLINGER_REVERSION',
    'BREAKOUT',
  ]),
});

export type CompareStrategiesInput = z.infer<typeof compareStrategiesSchema>;

export const quantitativeSignalsQuerySchema = z.object({
  strategyType: quantitativeStrategyTypeSchema.optional(),
  symbol: z.string().trim().max(16).optional(),
  signalType: z.enum(['BUY', 'SELL', 'HOLD']).optional(),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('1d'),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(50, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
});

export type QuantitativeSignalsQueryInput = z.infer<typeof quantitativeSignalsQuerySchema>;

// ============================================================================
// Phase 7: Advanced Technical Charting Validation Schemas
// ============================================================================

export const chartTypeSchema = z.enum(['CANDLESTICK', 'LINE', 'AREA', 'BAR']);

export const indicatorTypeSchema = z.enum([
  'SMA',
  'EMA',
  'BOLLINGER_BANDS',
  'VWAP',
  'RSI',
  'MACD',
  'STOCHASTIC',
]);

export const indicatorConfigSchema = z.object({
  id: z.string().min(1).max(64),
  type: indicatorTypeSchema,
  panel: z.enum(['OVERLAY', 'SEPARATE']),
  enabled: z.boolean(),
  params: z.object({
    period: z.number().int().min(1).max(500).optional(),
    fastPeriod: z.number().int().min(1).max(500).optional(),
    slowPeriod: z.number().int().min(1).max(500).optional(),
    signalPeriod: z.number().int().min(1).max(500).optional(),
    multiplier: z.number().min(0.1).max(10).optional(),
    kPeriod: z.number().int().min(1).max(500).optional(),
    dPeriod: z.number().int().min(1).max(500).optional(),
    slowing: z.number().int().min(1).max(500).optional(),
    source: z.enum(['close', 'high', 'low', 'open']).optional(),
  }).default({}),
  style: z.object({
    color: z.string().max(32).optional(),
    lineWidth: z.number().min(1).max(10).optional(),
    secondaryColor: z.string().max(32).optional(),
    tertiaryColor: z.string().max(32).optional(),
    histogramUpColor: z.string().max(32).optional(),
    histogramDownColor: z.string().max(32).optional(),
  }).default({}),
});

export const volumeProfileConfigSchema = z.object({
  enabled: z.boolean().default(true),
  binsCount: z.number().int().min(5).max(100).default(24),
  valueAreaPercent: z.number().min(10).max(95).default(70),
  pocColor: z.string().max(32).default('#F59E0B'),
  valueAreaColor: z.string().max(32).default('rgba(59, 130, 246, 0.4)'),
  nonValueAreaColor: z.string().max(32).default('rgba(107, 114, 128, 0.2)'),
  showLabels: z.boolean().default(true),
});

export const saveChartPreferenceSchema = z.object({
  symbol: z.string().trim().min(1).max(16).default('DEFAULT'),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('1d'),
  chartType: chartTypeSchema.default('CANDLESTICK'),
  indicatorsConfig: z.array(indicatorConfigSchema).default([]),
  volumeProfileConfig: volumeProfileConfigSchema.default({
    enabled: false,
    binsCount: 24,
    valueAreaPercent: 70,
    pocColor: '#F59E0B',
    valueAreaColor: 'rgba(59, 130, 246, 0.4)',
    nonValueAreaColor: 'rgba(107, 114, 128, 0.2)',
    showLabels: true,
  }),
});

export type SaveChartPreferenceInput = z.infer<typeof saveChartPreferenceSchema>;

export const volumeProfileQuerySchema = z.object({
  symbol: z.string().trim().min(1).max(16),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('1d'),
  binsCount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(5, parseInt(String(val), 10) || 24)) : 24)),
  valueAreaPercent: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(95, Math.max(10, parseFloat(String(val)) || 70)) : 70)),
});

export type VolumeProfileQueryInput = z.infer<typeof volumeProfileQuerySchema>;

export const calculateIndicatorsSchema = z.object({
  symbol: z.string().trim().min(1).max(16),
  interval: z.enum(['1m', '5m', '15m', '1h', '1d']).default('1d'),
  indicators: z.array(indicatorConfigSchema).min(1).max(20),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  includeVolumeProfile: z.boolean().default(false),
});

export type CalculateIndicatorsInput = z.infer<typeof calculateIndicatorsSchema>;

// ============================================================================
// Phase 8: Trader Achievements & Gamification Validation Schemas
// ============================================================================

export const achievementCategorySchema = z.enum([
  'BACKTESTING',
  'COMPETITION',
  'TRADING',
  'LEARNING',
]);

export const achievementQuerySchema = z.object({
  category: achievementCategorySchema.optional(),
});

export type AchievementQueryInput = z.infer<typeof achievementQuerySchema>;

export const achievementLeaderboardQuerySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? Math.min(100, Math.max(1, parseInt(String(val), 10) || 20)) : 20)),
});

export type AchievementLeaderboardQueryInput = z.infer<typeof achievementLeaderboardQuerySchema>;

// ============================================================================
// Phase 9A & 9B: Strategy DSL & Execution Validation Schemas
// ============================================================================

export const validateStrategySourceSchema = z.object({
  dslCode: z.string().min(1, 'DSL source code cannot be empty').max(50000, 'DSL source code exceeds 50KB limit'),
});

export type ValidateStrategySourceInput = z.infer<typeof validateStrategySourceSchema>;

export const createStrategySchema = z.object({
  name: z.string().trim().min(1, 'Strategy name is required').max(128, 'Strategy name too long'),
  description: z.string().trim().max(1000).optional(),
  dslCode: z.string().min(1, 'DSL code is required').max(50000),
  instrumentSymbol: z.string().trim().max(32).optional(),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '1d']).optional(),
});

export type CreateStrategyInput = z.infer<typeof createStrategySchema>;

export const updateStrategySchema = z.object({
  name: z.string().trim().min(1).max(128).optional(),
  description: z.string().trim().max(1000).optional(),
  dslCode: z.string().min(1).max(50000).optional(),
  instrumentSymbol: z.string().trim().max(32).optional(),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '1d']).optional(),
});

export type UpdateStrategyInput = z.infer<typeof updateStrategySchema>;

export const duplicateStrategySchema = z.object({
  newName: z.string().trim().min(1).max(128).optional(),
});

export type DuplicateStrategyInput = z.infer<typeof duplicateStrategySchema>;

export const createStrategyVersionSchema = z.object({
  changelog: z.string().trim().max(500).optional(),
});

export type CreateStrategyVersionInput = z.infer<typeof createStrategyVersionSchema>;

export const executeStrategySchema = z.object({
  version: z.number().int().positive().optional(),
  timeframe: z.string().trim().max(8).optional(),
  startDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  endDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  initialCapital: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => (val ? String(val) : '100000.0000')),
});

export type ExecuteStrategyInput = z.infer<typeof executeStrategySchema>;

// ============================================================================
// Phase 9D: Background Strategy Runner & Automated Virtual Trading Schemas
// ============================================================================

export const activateStrategyJobSchema = z.object({
  strategyId: z.number().int().positive('Valid strategy ID is required'),
  instrumentSymbol: z.string().trim().min(1).max(32).optional(),
  timeframe: z.enum(['1m', '5m', '15m', '1h', '1d']).optional(),
  riskLimits: z
    .object({
      maxPositionSize: z.number().min(0.01).max(1.0).optional(),
      maxOrderNotional: z.number().positive().optional(),
      maxDailyLoss: z.number().positive().optional(),
      maxOpenOrders: z.number().int().min(1).max(50).optional(),
      stopLossPercent: z.number().positive().max(100).optional(),
      takeProfitPercent: z.number().positive().max(1000).optional(),
    })
    .optional(),
});

export type ActivateStrategyJobInput = z.infer<typeof activateStrategyJobSchema>;

export const updateStrategyJobRiskSchema = z.object({
  riskLimits: z.object({
    maxPositionSize: z.number().min(0.01).max(1.0).optional(),
    maxOrderNotional: z.number().positive().optional(),
    maxDailyLoss: z.number().positive().optional(),
    maxOpenOrders: z.number().int().min(1).max(50).optional(),
    stopLossPercent: z.number().positive().max(100).optional(),
    takeProfitPercent: z.number().positive().max(1000).optional(),
  }),
});

export type UpdateStrategyJobRiskInput = z.infer<typeof updateStrategyJobRiskSchema>;




