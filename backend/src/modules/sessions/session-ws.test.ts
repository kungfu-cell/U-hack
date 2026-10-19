import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildApp } from '../../app.js';
import { DemoScribeProvider } from './pipeline/demo-scribe-adapter.js';
import { DemoAnalysisProvider } from '@scamtrap/analysis-core';
import { DemoAgentAdapter } from './handoff/agent-client.js';

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('Live Session WebSocket API', () => {
  it('connects to session WebSocket, receives initial sync, and handles live speech', async () => {
    const demoScribe = new DemoScribeProvider(false);
    app = await buildApp({
      scribeProvider: demoScribe,
      persistenceMode: 'memory',
      analysisProvider: new DemoAnalysisProvider(),
      agentClient: new DemoAgentAdapter(),
    });
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const port = (app.server.address() as { port: number }).port;

    // 1. Create an owned case and session via REST
    const caseRes = await app.inject({
      method: 'POST',
      url: '/cases',
      payload: { title: 'WebSocket test', isDemo: true },
    });
    const testCase = caseRes.json<{ id: string }>();
    const createRes = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { caseId: testCase.id },
    });
    expect(createRes.statusCode).toBe(201);
    const session = createRes.json<{ id: string; caseId: string; ownerToken: string; joinCode: string }>();

    // 2. Connect via WebSocket
    const wsUrl = `ws://127.0.0.1:${port}/sessions/${session.id}/ws?token=${session.ownerToken}`;
    const ws = new WebSocket(wsUrl);

    const receivedEvents: any[] = [];
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
      ws.on('message', (data) => {
        receivedEvents.push(JSON.parse(data.toString()));
      });
    });

    // 3. First message must be session.sync_response
    await new Promise((r) => setTimeout(r, 60));
    const syncEvent = receivedEvents.find((e) => e.type === 'session.sync_response');
    expect(syncEvent).toBeDefined();
    expect(syncEvent.snapshot.sessionId).toBe(session.id);
    expect(syncEvent.snapshot.state).toBe('human_active');

    // A caller joins with the short-lived room code and receives a separate token.
    const joinRes = await app.inject({
      method: 'POST',
      url: `/sessions/${session.id}/join`,
      payload: { joinCode: session.joinCode },
    });
    expect(joinRes.statusCode).toBe(200);
    const joined = joinRes.json<{ participantToken: string }>();
    const callerEvents: any[] = [];
    const callerWs = new WebSocket(
      `ws://127.0.0.1:${port}/sessions/${session.id}/ws?token=${joined.participantToken}`,
    );
    await new Promise<void>((resolve, reject) => {
      callerWs.on('open', resolve);
      callerWs.on('error', reject);
      callerWs.on('message', (data) => callerEvents.push(JSON.parse(data.toString())));
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(receivedEvents.some((event) => event.type === 'peer.joined' && event.role === 'caller')).toBe(true);

    ws.send(JSON.stringify({ type: 'signal.offer', sessionId: session.id, sdp: 'v=0\r\n' }));
    await new Promise((r) => setTimeout(r, 60));
    expect(callerEvents.some((event) => event.type === 'signal.offer' && event.fromRole === 'owner')).toBe(true);

    // 4. Test Ping / Pong
    ws.send(JSON.stringify({ type: 'ping', timestamp: 123456 }));
    await new Promise((r) => setTimeout(r, 60));
    const pongEvent = receivedEvents.find((e) => e.type === 'pong');
    expect(pongEvent).toBeDefined();
    expect(pongEvent.timestamp).toBe(123456);

    // 5. Test Live Speech Simulation
    const activeSessions = demoScribe.getActiveSessions();
    // Ingest audio chunk to trigger speaker session creation
    callerWs.send(
      JSON.stringify({
        type: 'audio.chunk',
        sessionId: session.id,
        speaker: 'caller',
        audioBase64: 'dGVzdA==',
        timestampMs: 1000,
      }),
    );

    await new Promise((r) => setTimeout(r, 80));
    const callerScribe = demoScribe.getActiveSessions().find((s) => s.speaker === 'caller');
    expect(callerScribe).toBeDefined();

    // Stream a high-risk phrase through demo scribe
    await callerScribe!.simulateStream(
      'ผมเป็นเจ้าหน้าที่ตำรวจ ให้โอนเงินมาตรวจสอบทันทีและห้ามบอกใคร',
      2,
      20,
    );

    await new Promise((r) => setTimeout(r, 120));

    // Verify partial was emitted
    const partials = receivedEvents.filter((e) => e.type === 'transcript.partial');
    expect(partials.length).toBeGreaterThan(0);

    // Verify committed was emitted
    const committed = receivedEvents.find(
      (e) => e.type === 'transcript.committed' && e.utterance.speaker === 'caller',
    );
    expect(committed).toBeDefined();

    // Verify risk score was updated
    const riskUpdated = receivedEvents.find((e) => e.type === 'risk.updated');
    expect(riskUpdated).toBeDefined();
    expect(riskUpdated.score).toBeGreaterThanOrEqual(70);

    // 6. Test simulate-speech endpoint directly
    const simulateRes = await app.inject({
      method: 'POST',
      url: `/sessions/${session.id}/simulate-speech`,
      payload: {
        speaker: 'caller',
        text: 'ทางธนาคารส่ง SMS รหัส OTP ไปให้แล้ว รบกวนแจ้งรหัสเดี๋ยวนี้',
      },
    });
    expect(simulateRes.statusCode).toBe(200);

    // Wait for simulated streaming to finish
    await new Promise((r) => setTimeout(r, 400));
    const otpCommitted = receivedEvents.find(
      (e) => e.type === 'transcript.committed' && e.utterance.text.includes('OTP'),
    );
    expect(otpCommitted).toBeDefined();

    // 7. Test Handoff transition
    const handoffRes = await app.inject({
      method: 'POST',
      url: `/sessions/${session.id}/handoff`,
      headers: { 'x-user-id': 'demo-user' },
    });
    expect(handoffRes.statusCode).toBe(202);

    // Wait for the automatic transition to ai_active (600ms + buffer)
    await new Promise((r) => setTimeout(r, 750));
    const aiActiveEvent = receivedEvents.find(
      (e) => e.type === 'session.state_changed' && e.state === 'ai_active',
    );
    expect(aiActiveEvent).toBeDefined();

    const aiUtterance = receivedEvents.find(
      (e) => e.type === 'transcript.committed' && e.utterance.speaker === 'ai',
    );
    expect(aiUtterance).toBeDefined();

    callerWs.close();
    ws.close();
  }, 15000);

  it('handles scammer signed URL requests for both Thai and English', async () => {
    app = await buildApp({
      persistenceMode: 'memory',
      analysisProvider: new DemoAnalysisProvider(),
      agentClient: new DemoAgentAdapter(),
    });

    const caseRes = await app.inject({
      method: 'POST',
      url: '/cases',
      payload: { title: 'Scammer Signed URL Test', isDemo: true },
    });
    const testCase = caseRes.json<{ id: string }>();
    const sessionRes = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { caseId: testCase.id },
    });
    const session = sessionRes.json<{ id: string }>();

    // Test Thai request
    const thRes = await app.inject({
      method: 'GET',
      url: `/sessions/${session.id}/scammer-signed-url?lang=th`,
      headers: { 'x-user-id': 'demo-user' },
    });
    expect([200, 503]).toContain(thRes.statusCode);
    if (thRes.statusCode === 200) {
      const data = thRes.json<{ signedUrl: string; agentId: string; lang: string }>();
      expect(data.lang).toBe('th');
      expect(data.agentId).toBe('agent_8401m506b9p0fnd88k4623jvfrqh');
    }

    // Test English request
    const enRes = await app.inject({
      method: 'GET',
      url: `/sessions/${session.id}/scammer-signed-url?lang=en`,
      headers: { 'x-user-id': 'demo-user' },
    });
    expect([200, 503]).toContain(enRes.statusCode);
    if (enRes.statusCode === 200) {
      const data = enRes.json<{ signedUrl: string; agentId: string; lang: string }>();
      expect(data.lang).toBe('en');
      expect(data.agentId).toBe('agent_1701m50fbxptfb19rdyds35gqstc');
    }
  }, 15000);
});

