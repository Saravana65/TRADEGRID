/**
 * Hardened Structured Logger for TRADEGRID Backend.
 * Standardizes log formatting with ISO timestamps, log levels, contextual metadata,
 * PII sanitization, and production JSON streaming.
 */

export type LogLevel = 'ERROR' | 'WARN' | 'INFO' | 'HTTP' | 'DEBUG';

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'secret',
  'jwt_secret',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'creditcard',
  'cardnumber',
]);

/**
 * Recursively scrubs passwords, tokens, API keys, and sensitive financial identifiers from logs.
 */
export function sanitizeMeta(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Mask potential JWT tokens (three base64 segments separated by dots)
    return obj.replace(/eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, '[REDACTED_JWT]');
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeMeta(item));
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const lower = key.toLowerCase().replace(/[-_]/g, '');
      if (SENSITIVE_KEYS.has(lower) || lower.includes('password') || lower.includes('secret')) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = sanitizeMeta(value);
      }
    }
    return cleaned;
  }

  return obj;
}

export function formatLogEntry(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const sanitized = meta ? sanitizeMeta(meta) : undefined;
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    // Structured JSON for log aggregators (ELK, CloudWatch, Datadog)
    const logObj = {
      timestamp,
      level,
      message,
      service: 'tradegrid-backend',
      ...(typeof sanitized === 'object' && sanitized !== null ? (sanitized as Record<string, unknown>) : { meta: sanitized }),
    };
    return JSON.stringify(logObj);
  }

  // Developer-friendly human-readable format
  const metaStr = sanitized ? ` | ${JSON.stringify(sanitized)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

export const logger = {
  info: (message: string, meta?: unknown) => {
    console.log(formatLogEntry('INFO', message, meta));
  },
  warn: (message: string, meta?: unknown) => {
    console.warn(formatLogEntry('WARN', message, meta));
  },
  error: (message: string, meta?: unknown) => {
    console.error(formatLogEntry('ERROR', message, meta));
  },
  http: (message: string, meta?: unknown) => {
    console.log(formatLogEntry('HTTP', message, meta));
  },
  debug: (message: string, meta?: unknown) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(formatLogEntry('DEBUG', message, meta));
    }
  },
};
