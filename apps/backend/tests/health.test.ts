import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

describe('Health Check Endpoint (GET /api/v1/health)', () => {
  it('should return 200 OK and status ok when database is connected', async () => {
    const app = createApp({
      customCheckDb: async () => true,
    });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.service).toBe('tradegrid-backend');
    expect(res.body.data.database).toBe('connected');
    expect(res.body.data.version).toBe('1.0.0');
    expect(typeof res.body.data.uptime).toBe('number');
  });

  it('should return 503 Service Unavailable when database is disconnected', async () => {
    const app = createApp({
      customCheckDb: async () => false,
    });

    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.database).toBe('disconnected');
  });

  it('should return 404 for unknown endpoints', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/unknown-route');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
