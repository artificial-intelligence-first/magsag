import { randomUUID } from 'node:crypto';

type JsonObject = Record<string, unknown>;

export interface DelegationRequest {
  target: string;
  input: JsonObject;
  context?: JsonObject;
}

export interface A2ARuntime {
  delegate?(request: DelegationRequest): Promise<JsonObject>;
  discoverCapabilities?(capability: string): Promise<string[]>;
  log?(event: string, data?: JsonObject): void;
  now?(): Date;
}

export interface A2AResult {
  result: JsonObject;
  metadata: {
    runId: string;
    timestamp: string;
    version: string;
    taskCount: number;
    successfulTasks: number;
    a2aTargets: string[];
  };
}

const runId = () => `mag-a2a-${randomUUID().slice(0, 8)}`;

export const run = async (
  payload: JsonObject,
  runtime: A2ARuntime = {}
): Promise<A2AResult> => {
  const startedAt = runtime.now?.() ?? new Date();
  runtime.log?.('start', { payload });

  const targets = runtime.discoverCapabilities
    ? await runtime.discoverCapabilities('multi-agent-coordination')
    : ['your-a2a-advisor-sag'];

  const responses: Array<{ target: string; status: 'success' | 'failure'; output?: JsonObject; error?: string }> = [];

  for (const target of targets) {
    if (!runtime.delegate) {
      responses.push({ target, status: 'success', output: payload });
      continue;
    }

    try {
      const output = await runtime.delegate({
        target,
        input: payload,
        context: { startedAt: startedAt.toISOString() }
      });
      responses.push({ target, status: 'success', output });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runtime.log?.('delegation_error', { target, message });
      responses.push({ target, status: 'failure', error: message });
    }
  }

  const successful = responses.filter((response) => response.status === 'success');
  if (successful.length === 0) {
    throw new Error('All A2A delegations failed. Customize fallbacks to meet your SLA.');
  }

  const completedAt = runtime.now?.() ?? new Date();
  const metadata = {
    runId: runId(),
    timestamp: completedAt.toISOString(),
    version: '0.1.0',
    taskCount: responses.length,
    successfulTasks: successful.length,
    a2aTargets: targets
  };

  runtime.log?.('end', { metadata });

  return { result: successful[0].output ?? {}, metadata };
};
