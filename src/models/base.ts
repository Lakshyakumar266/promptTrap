import { AgentAction, PageObservation } from '../core/types.js';

export interface ModelPrompt {
  trustedUserTask: string;
  policyRules: string;
  observation: PageObservation;
  history: AgentAction[];
  retryFeedback?: string;
}

export interface ModelAdapter {
  name: string;
  provider: string;
  decideAction(prompt: ModelPrompt): Promise<AgentAction>;
}
