import { randomBytes, randomUUID } from 'node:crypto';
import type { HandoffState, ParticipantRole } from '@scamtrap/contracts';

export interface SessionRecord {
  id: string;
  ownerId: string;
  caseId: string;
  state: HandoffState;
  joinCode: string;
  ownerToken: string;
  callerToken: string;
  joinExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();

  create(ownerId: string, caseId: string) {
    const now = new Date().toISOString();
    const session: SessionRecord = {
      id: randomUUID(),
      ownerId,
      caseId,
      state: 'human_active',
      joinCode: randomBytes(3).toString('hex').toUpperCase(),
      ownerToken: randomUUID(),
      callerToken: randomUUID(),
      joinExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  join(id: string, joinCode: string) {
    const session = this.sessions.get(id);
    if (
      !session ||
      session.state === 'ended' ||
      Date.parse(session.joinExpiresAt) < Date.now() ||
      session.joinCode !== joinCode.trim().toUpperCase()
    ) return undefined;
    return {
      sessionId: session.id,
      caseId: session.caseId,
      state: session.state,
      role: 'caller' as const,
      participantToken: session.callerToken,
    };
  }

  authorizeParticipant(session: SessionRecord, token: string): ParticipantRole | undefined {
    if (token === session.ownerToken) return 'owner';
    if (token === session.callerToken) return 'caller';
    return undefined;
  }

  requestHandoff(session: SessionRecord) {
    if (session.state !== 'human_active') throw new Error('INVALID_SESSION_TRANSITION');
    return this.update(session, 'preparing_ai');
  }

  activateAi(session: SessionRecord) {
    return this.update(session, 'ai_active');
  }

  pauseSafe(session: SessionRecord) {
    return this.update(session, 'paused_safe');
  }


  resumeHuman(session: SessionRecord) {

    if (!['ai_active', 'preparing_ai', 'waiting_for_user', 'paused_safe'].includes(session.state)) {
      throw new Error('INVALID_SESSION_TRANSITION');
    }
    return this.update(session, 'human_active');
  }

  end(session: SessionRecord) {
    return this.update(session, 'ended');
  }

  private update(session: SessionRecord, state: HandoffState) {
    const updated = { ...session, state, updatedAt: new Date().toISOString() };
    this.sessions.set(updated.id, updated);
    return updated;
  }
}
