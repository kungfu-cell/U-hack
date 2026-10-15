import { describe, expect, it } from 'vitest';
import { HandoffStateMachine } from './handoff-state-machine.js';

describe('HandoffStateMachine', () => {
  it('initializes with default state human_active', () => {
    const sm = new HandoffStateMachine();
    expect(sm.getState()).toBe('human_active');
  });

  it('allows valid progressive handoff transitions', () => {
    const sm = new HandoffStateMachine('human_active');
    expect(sm.canTransition('request_handoff')).toBe(true);
    sm.transition('request_handoff');
    expect(sm.getState()).toBe('preparing_ai');

    expect(sm.canTransition('ai_ready')).toBe(true);
    sm.transition('ai_ready');
    expect(sm.getState()).toBe('ai_active');
  });

  it('allows human takeover/resume transitions from ai_active', () => {
    const sm = new HandoffStateMachine('ai_active');
    expect(sm.canTransition('resume_human')).toBe(true);
    sm.transition('resume_human');
    expect(sm.getState()).toBe('human_active');
  });

  it('CRITICAL SAFETY: on agent error, transitions to paused_safe rather than unmuting human mic', () => {
    const sm = new HandoffStateMachine('ai_active');
    expect(sm.canTransition('agent_error')).toBe(true);
    sm.transition('agent_error');

    expect(sm.getState()).toBe('paused_safe');
    // From paused_safe, user can explicitly resume or end
    expect(sm.canTransition('resume_human')).toBe(true);
    expect(sm.canTransition('end_call')).toBe(true);
  });

  it('rejects invalid state transitions', () => {
    const sm = new HandoffStateMachine('ended');
    expect(sm.canTransition('request_handoff')).toBe(false);
    expect(() => sm.transition('request_handoff')).toThrowError(
      /INVALID_TRANSITION: Cannot trigger request_handoff from ended/,
    );
  });

  it('allows emergency forceState override when needed', () => {
    const sm = new HandoffStateMachine('paused_safe');
    sm.forceState('ended');
    expect(sm.getState()).toBe('ended');
  });
});
