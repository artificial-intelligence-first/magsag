import type { EngineId, RunSpec } from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

export interface BuildRunSpecOptions {
  engine?: EngineId;
  repo?: string;
  resumeId?: string;
  extra?: Record<string, unknown>;
}

export const buildRunSpec = (
  prompt: string,
  options: BuildRunSpecOptions = {}
): RunSpec => {
  const spec: RunSpec = {
    engine: options.engine ?? 'codex-cli',
    repo: options.repo ?? process.cwd(),
    prompt
  };

  if (options.resumeId) {
    spec.resumeId = options.resumeId;
  }

  if (options.extra) {
    spec.extra = options.extra;
  }

  return runSpecSchema.parse(spec);
};
