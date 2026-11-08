import { logger } from '../../utils/logger';

export interface SecretValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface SecurityConfigInput {
  NODE_ENV?: string;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  DB_PASSWORD?: string;
  CORS_ORIGIN?: string;
}

const INSECURE_PATTERNS = ['dev', 'test', 'default', 'secret', 'password', '12345'];

/**
 * Validates security secrets on startup to fail-fast against insecure defaults.
 */
export function validateProductionSecrets(
  env: SecurityConfigInput = process.env
): SecretValidationResult {
  const isProd = (env.NODE_ENV || '').toLowerCase() === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  const accessSecret = env.JWT_ACCESS_SECRET || '';
  const refreshSecret = env.JWT_REFRESH_SECRET || '';
  const dbPassword = env.DB_PASSWORD || '';
  const corsOrigin = env.CORS_ORIGIN || '';

  // 1. JWT Access Secret Entropy Check
  if (!accessSecret) {
    errors.push('JWT_ACCESS_SECRET is missing or empty.');
  } else if (accessSecret.length < 32) {
    errors.push(
      `JWT_ACCESS_SECRET entropy insufficient: Length is ${accessSecret.length} chars (minimum 32 required).`
    );
  }

  // 2. JWT Refresh Secret Entropy Check
  if (!refreshSecret) {
    errors.push('JWT_REFRESH_SECRET is missing or empty.');
  } else if (refreshSecret.length < 32) {
    errors.push(
      `JWT_REFRESH_SECRET entropy insufficient: Length is ${refreshSecret.length} chars (minimum 32 required).`
    );
  }

  // 3. Secret Collision Check
  if (accessSecret && refreshSecret && accessSecret === refreshSecret) {
    errors.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must not be identical.');
  }

  // In production mode, enforce strict checks against known dev defaults
  if (isProd) {
    for (const pat of INSECURE_PATTERNS) {
      if (accessSecret.toLowerCase().includes(pat)) {
        errors.push(`JWT_ACCESS_SECRET contains insecure development keyword '${pat}'.`);
        break;
      }
    }

    for (const pat of INSECURE_PATTERNS) {
      if (refreshSecret.toLowerCase().includes(pat)) {
        errors.push(`JWT_REFRESH_SECRET contains insecure development keyword '${pat}'.`);
        break;
      }
    }

    if (dbPassword === 'tradegrid_secure_password' || !dbPassword) {
      errors.push('DB_PASSWORD is using the default development password or is empty.');
    }

    if (corsOrigin === '*' || !corsOrigin) {
      errors.push('CORS_ORIGIN must not be a wildcard (*) in production deployment.');
    }
  } else {
    // In development/test mode, issue warnings rather than blocking errors
    if (accessSecret.length < 32) {
      warnings.push('JWT_ACCESS_SECRET is under 32 characters (acceptable only in dev/test).');
    }
  }

  const isValid = errors.length === 0;

  if (!isValid && isProd) {
    logger.error(`[SECURITY AUDIT] Production secret validation failed:\n - ${errors.join('\n - ')}`);
  }

  return { isValid, errors, warnings };
}

/**
 * Asserts security readiness on application startup.
 */
export function assertSecurityReadiness(env: SecurityConfigInput = process.env): void {
  const result = validateProductionSecrets(env);
  if (!result.isValid && (env.NODE_ENV || '').toLowerCase() === 'production') {
    throw new Error(
      `FATAL: Production security validation failed:\n${result.errors.map((e) => `• ${e}`).join('\n')}`
    );
  }
}
