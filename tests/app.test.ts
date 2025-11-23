/**
 * Basic integration tests for the SOACRS Express app.
 *
 * This verifies that the healthcheck endpoint is wired correctly
 * and that our Express app can be instantiated without errors.
 */
import request from 'supertest';
import { createApp } from '../src/app';

describe('SOACRS app', () => {
  const app = createApp();

  it('should respond to GET /health with status 200 and JSON body', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('service', 'soacrs');
    expect(typeof response.body.timestamp).toBe('string');
  });
});
