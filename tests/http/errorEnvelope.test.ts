import request from 'supertest';
import { createApp } from '../../src/app';

describe('Error envelope + correlationId (SOA-S19)', () => {
  test('adds x-correlation-id to responses (generated)', async () => {
    const app = createApp(); // stubs are fine for /health
    const res = await request(app).get('/health').expect(200);

    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  test('echoes x-correlation-id when provided', async () => {
    const app = createApp();
    const res = await request(app).get('/health').set('x-correlation-id', 'corr-xyz').expect(200);

    expect(res.headers['x-correlation-id']).toBe('corr-xyz');
  });

  test('404 uses standard error envelope', async () => {
    const app = createApp();
    const res = await request(app).get('/nope').expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.correlationId).toBeTruthy();
  });
});
