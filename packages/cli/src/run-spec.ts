import type { EngineId, RunSpec, WorkspaceConfig } from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

export interface BuildRunSpecOptions {
  engine?: EngineId;
  repo?: string;
  resumeId?: string;
  extra?: Record<string, unknown>;
  workspace?: WorkspaceConfig;
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

  if (options.extra || options.workspace) {
    spec.extra = {
      ...(options.extra ?? {}),
      ...(options.workspace ? { workspace: options.workspace } : {})
    };
  }

  return runSpecSchema.parse(spec);
};
