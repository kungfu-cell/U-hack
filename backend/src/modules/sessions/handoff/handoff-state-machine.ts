import type { HandoffState } from '@scamtrap/contracts';

export type HandoffTrigger =
  | 'start_call'
  | 'request_handoff'
  | 'ai_ready'
  | 'resume_human'
  | 'human_ready'
  | 'agent_error'
  | 'end_call';

export class HandoffStateMachine {
  private currentState: HandoffState;

  constructor(initialState: HandoffState = 'human_active') {
    this.currentState = initialState;
  }

  getState(): HandoffState {
    return this.currentState;
  }

  canTransition(trigger: HandoffTrigger): boolean {
    switch (trigger) {
      case 'start_call':
        return this.currentState === 'ready';

      case 'request_handoff':
        return this.currentState === 'human_active';

      case 'ai_ready':
        return this.currentState === 'preparing_ai' || this.currentState === 'human_active';

      case 'resume_human':
        return (
          this.currentState === 'ai_active' ||
          this.currentState === 'preparing_ai' ||
          this.currentState === 'paused_safe' ||
          this.currentState === 'waiting_for_user'
        );

      case 'human_ready':
        return this.currentState === 'stopping_ai';

      case 'agent_error':
        // Crucial safety rule: on agent error, go to paused_safe, never unmute human automatically
        return this.currentState === 'ai_active' || this.currentState === 'preparing_ai';

      case 'end_call':
        return this.currentState !== 'ended';

      default:
        return false;
    }
  }

  transition(trigger: HandoffTrigger): HandoffState {
    if (!this.canTransition(trigger)) {
      throw new Error(`INVALID_TRANSITION: Cannot trigger ${trigger} from ${this.currentState}`);
    }

    switch (trigger) {
      case 'start_call':
        this.currentState = 'human_active';
        break;

      case 'request_handoff':
        this.currentState = 'preparing_ai';
        break;

      case 'ai_ready':
        this.currentState = 'ai_active';
        break;

      case 'resume_human':
        this.currentState = 'human_active';
        break;

      case 'agent_error':
        this.currentState = 'paused_safe';
        break;

      case 'end_call':
        this.currentState = 'ended';
        break;
    }

    return this.currentState;
  }

  forceState(state: HandoffState): void {
    this.currentState = state;
  }
}
