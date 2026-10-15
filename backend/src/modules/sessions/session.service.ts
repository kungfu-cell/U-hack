import { randomUUID } from 'node:crypto';
import type { HandoffState } from '@scamtrap/contracts';

export interface SessionRecord {
  id: string;
  ownerId: string;
  caseId: string;
  state: HandoffState;
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
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  requestHandoff(session: SessionRecord) {
    if (session.state === 'ended') throw new Error('INVALID_SESSION_TRANSITION');
    return this.update(session, 'ai_active');
  }

  activateAi(session: SessionRecord) {
    return this.update(session, 'ai_active');
  }


  resumeHuman(session: SessionRecord) {

    if (!['ai_active', 'preparing_ai', 'waiting_for_user'].includes(session.state)) {
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
