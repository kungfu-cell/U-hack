import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('API smoke test', () => {
  it('completes the text-to-analysis flow', async () => {
    app = await buildApp();

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/cases',
      payload: { title: 'Test case', isDemo: true },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json<{ id: string }>();

    const inputResponse = await app.inject({
      method: 'POST',
      url: `/cases/${created.id}/inputs`,
      payload: {
        type: 'text',
        content: 'ผมเป็นเจ้าหน้าที่ตำรวจ ให้โอนเงินมาตรวจสอบทันที',
        source: 'test',
      },
    });
    expect(inputResponse.statusCode).toBe(201);

    const analysisResponse = await app.inject({
      method: 'POST',
      url: `/cases/${created.id}/analyses`,
      payload: {},
    });
    expect(analysisResponse.statusCode).toBe(200);
    expect(analysisResponse.json().latestAnalysis.level).toBe('critical');
  });

  it('enforces case ownership', async () => {
    app = await buildApp();
    const createdResponse = await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { 'x-user-id': 'owner-a' },
      payload: { title: 'Private case', isDemo: true },
    });
    const created = createdResponse.json<{ id: string }>();

    const response = await app.inject({
      method: 'GET',
      url: `/cases/${created.id}`,
      headers: { 'x-user-id': 'owner-b' },
    });

    expect(response.statusCode).toBe(403);
  });
});
