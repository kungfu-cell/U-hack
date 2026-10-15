import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { DemoAnalysisProvider } from '@scamtrap/analysis-core';
import { buildApp } from './app.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('API smoke test', () => {
  it('completes the text-to-analysis flow', async () => {
    app = await buildApp({ analysisProvider: new DemoAnalysisProvider() });

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
        content: 'ผมเป็นเจ้าหน้าที่ตำรวจ ให้โอนเงินมาตรวจสอบทันทีที่ https://danger.example/path',
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

    const reportResponse = await app.inject({
      method: 'GET',
      url: `/cases/${created.id}/report`,
    });
    expect(reportResponse.statusCode).toBe(200);
    expect(reportResponse.json().evidence.length).toBeGreaterThan(0);

    const indicatorId = reportResponse.json().entities[0]?.id as string | undefined;
    expect(indicatorId).toBeDefined();
    const shareResponse = await app.inject({
      method: 'POST',
      url: `/cases/${created.id}/share-proposals`,
      payload: { indicatorIds: [indicatorId], consentConfirmed: true },
    });
    expect(shareResponse.statusCode).toBe(201);
    expect(shareResponse.json().status).toBe('pending');

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/cases/${created.id}`,
    });
    expect(deleteResponse.statusCode).toBe(204);
  });

  it('enforces case ownership', async () => {
    app = await buildApp({ analysisProvider: new DemoAnalysisProvider() });
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

    await app.inject({
      method: 'DELETE',
      url: `/cases/${created.id}`,
      headers: { 'x-user-id': 'owner-a' },
    });
  });
});

const postgresEnabled = process.env.PERSISTENCE_MODE === 'postgres';

describe.runIf(postgresEnabled)('PostgreSQL governance integration', () => {
  it('persists consent, review, audit, report, and withdrawal lifecycle', async () => {
    const reviewerKey = 'integration-reviewer-key';
    const demoProvider = new DemoAnalysisProvider();
    app = await buildApp({
      persistenceMode: 'postgres',
      reviewerApiKey: reviewerKey,
      analysisProvider: {
        name: 'integration-non-demo',
        analyzeText: async (input) => ({
          ...(await demoProvider.analyzeText(input)),
          isDemo: false,
        }),
      },
    });

    const created = (await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { 'x-user-id': 'governance-owner' },
      payload: { title: 'Governance integration', isDemo: false },
    })).json<{ id: string }>();

    await app.inject({
      method: 'POST',
      url: `/cases/${created.id}/inputs`,
      headers: { 'x-user-id': 'governance-owner' },
      payload: {
        type: 'text',
        content: 'กรุณาโอนเงินไปบัญชี 1234567890 ทันทีและห้ามบอกใคร',
        source: 'integration-test',
      },
    });
    await app.inject({
      method: 'POST',
      url: `/cases/${created.id}/analyses`,
      headers: { 'x-user-id': 'governance-owner' },
    });

    const reportResponse = await app.inject({
      method: 'GET',
      url: `/cases/${created.id}/report`,
      headers: { 'x-user-id': 'governance-owner' },
    });
    expect(reportResponse.statusCode).toBe(200);
    expect(reportResponse.json().inputs[0]?.content).not.toContain('1234567890');
    expect(reportResponse.json().entities[0]?.value).not.toBe('1234567890');
    const entityId = reportResponse.json().entities[0]?.id as string;

    const shareResponse = await app.inject({
      method: 'POST',
      url: `/cases/${created.id}/share-proposals`,
      headers: { 'x-user-id': 'governance-owner' },
      payload: { indicatorIds: [entityId], consentConfirmed: true },
    });
    expect(shareResponse.statusCode).toBe(201);
    const indicatorId = shareResponse.json().id as string;

    const consents = await app.inject({
      method: 'GET',
      url: `/cases/${created.id}/consents`,
      headers: { 'x-user-id': 'governance-owner' },
    });
    expect(consents.json().some((item: { scope: string }) => item.scope === 'community_share')).toBe(true);

    const queue = await app.inject({
      method: 'GET',
      url: '/review/indicators',
      headers: { 'x-reviewer-key': reviewerKey },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json().some((item: { id: string }) => item.id === indicatorId)).toBe(true);

    const reviewed = await app.inject({
      method: 'PATCH',
      url: `/review/indicators/${indicatorId}`,
      headers: { 'x-reviewer-key': reviewerKey, 'x-reviewer-id': 'reviewer-test' },
      payload: { status: 'approved' },
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json().status).toBe('approved');
    expect(reviewed.json().maskedValue).not.toContain('1234567890');

    const correlations = await app.inject({
      method: 'GET',
      url: `/cases/${created.id}/correlations`,
      headers: { 'x-user-id': 'governance-owner' },
    });
    expect(correlations.statusCode).toBe(200);
    expect(correlations.json().targetCaseId).toBe(created.id);

    const audit = await app.inject({
      method: 'GET',
      url: `/cases/${created.id}/audit`,
      headers: { 'x-user-id': 'governance-owner' },
    });
    expect(audit.json().some((item: { action: string }) => item.action === 'INDICATOR_APPROVED')).toBe(true);

    const withdrawal = await app.inject({
      method: 'POST',
      url: `/cases/${created.id}/withdrawal`,
      headers: { 'x-user-id': 'governance-owner' },
      payload: { reason: 'integration cleanup', maskInputs: true },
    });
    expect(withdrawal.statusCode).toBe(200);
    expect(withdrawal.json().success).toBe(true);

    const missing = await app.inject({
      method: 'GET',
      url: `/cases/${created.id}`,
      headers: { 'x-user-id': 'governance-owner' },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('persists and corrects committed session transcripts', async () => {
    app = await buildApp({
      persistenceMode: 'postgres',
      analysisProvider: new DemoAnalysisProvider(),
    });
    const owner = 'transcript-owner';
    const created = (await app.inject({
      method: 'POST',
      url: '/cases',
      headers: { 'x-user-id': owner },
      payload: { title: 'Transcript integration', isDemo: true },
    })).json<{ id: string }>();
    const sessionResponse = await app.inject({
      method: 'POST',
      url: '/sessions',
      headers: { 'x-user-id': owner },
      payload: { caseId: created.id },
    });
    expect(sessionResponse.statusCode).toBe(201);
    const session = sessionResponse.json<{ id: string }>();

    await app.inject({
      method: 'POST',
      url: `/sessions/${session.id}/simulate-speech`,
      headers: { 'x-user-id': owner },
      payload: { speaker: 'caller', text: 'ข้อความทดสอบการถอดเสียง' },
    });

    let utterances: Array<{ id: string; text: string }> = [];
    for (let attempt = 0; attempt < 10 && utterances.length === 0; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const response = await app.inject({
        method: 'GET',
        url: `/sessions/${session.id}/utterances`,
        headers: { 'x-user-id': owner },
      });
      utterances = response.json();
    }
    expect(utterances.length).toBeGreaterThan(0);

    const correction = await app.inject({
      method: 'PATCH',
      url: `/sessions/${session.id}/utterances/${utterances[0]!.id}`,
      headers: { 'x-user-id': owner },
      payload: { text: 'ข้อความที่แก้ไขแล้ว' },
    });
    expect(correction.statusCode).toBe(200);
    expect(correction.json().transcriptState).toBe('corrected');
    expect(correction.json().version).toBe(2);

    await app.inject({
      method: 'POST',
      url: `/cases/${created.id}/withdrawal`,
      headers: { 'x-user-id': owner },
      payload: { reason: 'integration cleanup' },
    });
  });
});
