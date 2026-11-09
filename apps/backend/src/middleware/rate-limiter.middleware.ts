import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  tierName?: string;
  keyGenerator?: (req: Request) => string;
  skipInTest?: boolean;
}

interface ClientBucket {
  count: number;
  resetTimeMs: number;
}

/**
 * Checks if a request originates from localhost / loopback.
 */
function isLocalhostRequest(req: Request): boolean {
  const ip =
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    '127.0.0.1';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('127.') ||
    req.hostname === 'localhost'
  );
}

/**
 * Creates an in-memory sliding window rate limiter middleware.
 * Zero-cost ($0 infrastructure) abuse and denial-of-service protection.
 */
export function createRateLimiter(options: RateLimitOptions) {
  const windowMs = options.windowMs;
  const baseMaxRequests = options.maxRequests;
  const tierName = options.tierName || 'GENERAL';
  const skipInTest = options.skipInTest ?? true;

  const defaultKeyGen = (req: Request): string => {
    // If authenticated user is attached to request, prioritize userId
    const user = (req as any).user;
    if (user && user.id) {
      return `user:${user.id}`;
    }
    // Fall back to client IP address
    const ip =
      req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      '127.0.0.1';
    return `ip:${Array.isArray(ip) ? ip[0] : ip}`;
  };

  const keyGen = options.keyGenerator || defaultKeyGen;
  const buckets: Map<string, ClientBucket> = new Map();

  // Periodic cleanup of expired buckets every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets.entries()) {
      if (now > bucket.resetTimeMs) {
        buckets.delete(key);
      }
    }
  }, 5 * 60 * 1000).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, skip unless explicitly testing the rate limiter
    if (skipInTest && process.env.NODE_ENV === 'test' && !(req as any).__testRateLimit) {
      return next();
    }

    // In unit test environment, strictly use baseMaxRequests so assertions match
    const isVitest = process.env.NODE_ENV === 'test';
    const isDev = !isVitest && process.env.NODE_ENV !== 'production';
    const isLocal = !isVitest && isLocalhostRequest(req);
    const maxRequests = (isDev || isLocal)
      ? Math.max(baseMaxRequests * 10, 300)
      : baseMaxRequests;

    const key = `${tierName}:${keyGen(req)}`;
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now > bucket.resetTimeMs) {
      bucket = {
        count: 1,
        resetTimeMs: now + windowMs,
      };
      buckets.set(key, bucket);
    } else {
      bucket.count++;
    }

    const remaining = Math.max(0, maxRequests - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetTimeMs - now) / 1000));

    res.setHeader('RateLimit-Limit', maxRequests);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (bucket.count > maxRequests) {
      res.setHeader('Retry-After', resetSeconds);
      logger.warn(`[RATE LIMIT EXCEEDED] Tier ${tierName} hit for ${key}. Retry after ${resetSeconds}s.`);
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests for ${tierName}. Please try again after ${resetSeconds} seconds.`,
          retryAfterSeconds: resetSeconds,
          tier: tierName,
        },
      });
      return;
    }

    next();
  };
}

// Pre-configured Production Tier Rate Limiters
// 1. Auth endpoints (Login, Register): 60 req / minute (relaxed in dev/localhost)
export const authRateLimiter = createRateLimiter({
  tierName: 'AUTH',
  windowMs: 60 * 1000,
  maxRequests: 60,
});

// 2. Order submission: 60 req / minute per user/IP
export const orderRateLimiter = createRateLimiter({
  tierName: 'ORDER',
  windowMs: 60 * 1000,
  maxRequests: 60,
});

// 3. Market data queries: 300 req / minute per IP
export const marketRateLimiter = createRateLimiter({
  tierName: 'MARKET_DATA',
  windowMs: 60 * 1000,
  maxRequests: 300,
});

// 4. General API requests: 120 req / minute
export const generalRateLimiter = createRateLimiter({
  tierName: 'GENERAL_API',
  windowMs: 60 * 1000,
  maxRequests: 120,
});
