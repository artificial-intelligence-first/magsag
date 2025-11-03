import {
  InMemoryRunnerRegistry,
  type RunnerFactory,
  type RunnerRegistry
} from '@magsag/core';
import { createCodexCliRunner } from '@magsag/runner-codex-cli';
import { createClaudeCliRunner } from '@magsag/runner-claude-cli';
import { createOpenAiAgentsRunner } from '@magsag/runner-openai-agents';
import { createClaudeAgentRunner } from '@magsag/runner-claude-agent';
import { createGoogleAdkRunner } from '@magsag/runner-adk';

const factories: RunnerFactory[] = [
  {
    id: 'codex-cli',
    create: () => createCodexCliRunner()
  },
  {
    id: 'claude-cli',
    create: () => createClaudeCliRunner()
  },
  {
    id: 'openai-agents',
    create: () => createOpenAiAgentsRunner()
  },
  {
    id: 'claude-agent',
    create: () => createClaudeAgentRunner()
  },
  {
    id: 'adk',
    create: () => createGoogleAdkRunner()
  }
];

export const createDefaultRunnerRegistry = (): RunnerRegistry => {
  const registry = new InMemoryRunnerRegistry();
  for (const factory of factories) {
    registry.register(factory);
  }
  return registry;
};

let cachedRegistry: RunnerRegistry | undefined;

export const getDefaultRunnerRegistry = (): RunnerRegistry => {
  if (!cachedRegistry) {
    cachedRegistry = createDefaultRunnerRegistry();
  }
  return cachedRegistry;
};
