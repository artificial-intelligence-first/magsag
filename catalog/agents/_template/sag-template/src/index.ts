export interface SagRuntime {
  log?(event: string, data?: Record<string, unknown>): void;
  tools?: Record<string, unknown>;
}

export interface SagResult {
  result: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export const run = async (
  payload: Record<string, unknown>,
  runtime: SagRuntime = {}
): Promise<SagResult> => {
  runtime.log?.('start', { payload });

  // TODO: Replace this placeholder with domain-specific logic.
  const result = {
    ...payload,
    processedAt: new Date().toISOString()
  } satisfies Record<string, unknown>;

  runtime.log?.('end', { status: 'success' });

  return { result };
};
