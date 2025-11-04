import type { AgentContext } from '../shared/types.js';

type AgentHandler = (
  payload: Record<string, unknown>,
  context?: AgentContext
) => Promise<Record<string, unknown>>;

const placeholder = (name: string): AgentHandler => {
  return async (payload) => ({
    message: `Template agent '${name}' is not yet implemented. Replace the catalog entrypoint with your handler.`,
    received: payload
  });
};

export const yourOrchestratorMag = placeholder('yourOrchestratorMag');
export const yourAdvisorSag = placeholder('yourAdvisorSag');
export const yourA2aOrchestratorMag = placeholder('yourA2aOrchestratorMag');
export const yourA2aAdvisorSag = placeholder('yourA2aAdvisorSag');
