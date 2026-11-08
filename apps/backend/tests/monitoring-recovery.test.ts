import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import {
  sanitizeMeta,
  formatLogEntry,
} from '../src/utils/logger';
import {
  DatabaseBackupManager,
} from '../src/infrastructure/scripts/backup-database';

describe('Phase 11D: Monitoring, Backups and Disaster Recovery', () => {
  describe('1. Structured Logging & PII Sanitization', () => {
    it('should recursively sanitize passwords, secrets, and auth tokens from metadata', () => {
      const sensitiveInput = {
        userId: 101,
        password: 'SuperSecretPassword123!',
        nested: {
          refreshToken: 'refresh_token_abcdef123456',
          apiKey: 'pk_live_9988776655',
          jwt_secret: 'raw_jwt_secret',
          safeField: 'trader_alex',
        },
      };

      const sanitized: any = sanitizeMeta(sensitiveInput);

      expect(sanitized.userId).toBe(101);
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.nested.refreshToken).toBe('[REDACTED]');
      expect(sanitized.nested.apiKey).toBe('[REDACTED]');
      expect(sanitized.nested.jwt_secret).toBe('[REDACTED]');
      expect(sanitized.nested.safeField).toBe('trader_alex');
    });

    it('should mask embedded JWT strings in text messages', () => {
      const mockJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozG4m1stCO54Z3W0';
      const text = `Failed request with header Bearer ${mockJwt} on endpoint`;
      const masked = sanitizeMeta(text);

      expect(masked).toContain('Bearer [REDACTED_JWT] on endpoint');
      expect(masked).not.toContain('eyJhbGciOiJIUzI1Ni');
    });

    it('should format log entries as valid JSON when in production mode', () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const jsonString = formatLogEntry('INFO', 'Order submitted successfully', {
          orderId: 456,
          symbol: 'RELIANCE',
          password: 'secret_password_here',
        });

        const parsed = JSON.parse(jsonString);
        expect(parsed.level).toBe('INFO');
        expect(parsed.message).toBe('Order submitted successfully');
        expect(parsed.service).toBe('tradegrid-backend');
        expect(parsed.orderId).toBe(456);
        expect(parsed.password).toBe('[REDACTED]');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });
  });

  describe('2. Health & Readiness Endpoints', () => {
    it('should return 200 OK on GET /health/liveness with process uptime', async () => {
      const app = createApp({ customCheckDb: async () => true });

      const res = await request(app).get('/health/liveness');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('alive');
      expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return 200 OK on GET /health/readiness when database is connected', async () => {
      const app = createApp({ customCheckDb: async () => true });

      const res = await request(app).get('/health/readiness');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ready');
      expect(res.body.data.database).toBe('connected');
    });

    it('should return 503 Service Unavailable on GET /health/readiness when database fails', async () => {
      const app = createApp({ customCheckDb: async () => false });

      const res = await request(app).get('/health/readiness');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.data.status).toBe('not_ready');
      expect(res.body.data.database).toBe('disconnected');
    });
  });

  describe('3. Automated Database Backup & Verification', () => {
    let backupManager: DatabaseBackupManager;

    beforeEach(() => {
      backupManager = new DatabaseBackupManager({
        database: 'tradegrid_test',
        outputDir: './test_backups',
      });
    });

    it('should construct consistent non-locking mysqldump command line', () => {
      const cmd = backupManager.buildDumpCommand('/tmp/backup.sql.gz');
      expect(cmd).toContain('--single-transaction');
      expect(cmd).toContain('--quick');
      expect(cmd).toContain('tradegrid_test');
      expect(cmd).toContain('gzip');
    });

    it('should generate valid timestamped backup filenames', () => {
      const filename = backupManager.generateBackupFilename();
      expect(filename).toMatch(/^tradegrid_backup_tradegrid_test_\d{8}_\d{6}\.sql\.gz$/);
    });

    it('should perform dry-run backup execution cleanly', async () => {
      const res = await backupManager.executeBackup(true);
      expect(res.success).toBe(true);
      expect(res.verificationPassed).toBe(true);
      expect(res.backupFile).toBeDefined();
    });
  });
});
