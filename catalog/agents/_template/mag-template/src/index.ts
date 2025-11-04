import { randomUUID } from 'node:crypto';

type JsonObject = Record<string, unknown>;

export interface DelegationRequest {
  sagId: string;
  input: JsonObject;
  context?: JsonObject;
}

export interface MagRuntime {
  delegate?(request: DelegationRequest): Promise<JsonObject>;
  log?(event: string, data?: JsonObject): void;
  now?(): Date;
}

export interface MagResult {
  result: JsonObject;
  metadata: {
    runId: string;
    timestamp: string;
    version: string;
    taskCount: number;
    successfulTasks: number;
  };
}

const generateRunId = (): string => `mag-${randomUUID().slice(0, 8)}`;

const normalizePayload = (payload: unknown): JsonObject =>
  typeof payload === 'object' && payload !== null ? (payload as JsonObject) : { value: payload };

export const run = async (
  payload: JsonObject,
  runtime: MagRuntime = {}
): Promise<MagResult> => {
  const startedAt = runtime.now?.() ?? new Date();
  runtime.log?.('start', { payload });

  const tasks: Array<{ status: 'success' | 'failure'; output?: JsonObject; error?: string }> = [];

  if (runtime.delegate) {
    try {
      const output = await runtime.delegate({
        sagId: 'your-advisor-sag',
        input: payload,
        context: { requestedAt: startedAt.toISOString() }
      });
      tasks.push({ status: 'success', output: normalizePayload(output) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      runtime.log?.('delegation_error', { message });
      tasks.push({ status: 'failure', error: message });
    }
  } else {
    tasks.push({ status: 'success', output: payload });
  }

  const successful = tasks.filter((task) => task.status === 'success');
  if (successful.length === 0) {
    throw new Error('All SAG delegations failed. Customize the MAG to handle fallbacks.');
  }

  const completedAt = runtime.now?.() ?? new Date();
  const result = successful[0].output ?? {};

  const metadata = {
    runId: generateRunId(),
    timestamp: completedAt.toISOString(),
    version: '0.1.0',
    taskCount: tasks.length,
    successfulTasks: successful.length
  };

  runtime.log?.('end', { metadata });

  return { result, metadata };
};
