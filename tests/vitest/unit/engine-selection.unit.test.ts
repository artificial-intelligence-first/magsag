import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_SELECTION,
  ENGINE_ENV,
  resolveEngineSelection
} from '@magsag/core';

const withEnv = (env: Partial<Record<string, string>>): Record<string, string> => ({
  [ENGINE_ENV.mode]: env[ENGINE_ENV.mode] ?? '',
  [ENGINE_ENV.mag]: env[ENGINE_ENV.mag] ?? '',
  [ENGINE_ENV.sag]: env[ENGINE_ENV.sag] ?? ''
});

describe('resolveEngineSelection', () => {
  it('returns defaults when env is empty', () => {
    const result = resolveEngineSelection({});
    expect(result).toStrictEqual(DEFAULT_ENGINE_SELECTION);
  });

  it('accepts valid overrides', () => {
    const env = withEnv({
      [ENGINE_ENV.mode]: 'api',
      [ENGINE_ENV.mag]: 'openai-agents',
      [ENGINE_ENV.sag]: 'claude-agent'
    });
    const result = resolveEngineSelection(env);
    expect(result).toStrictEqual({
      mode: 'api',
      mag: 'openai-agents',
      sag: 'claude-agent'
    });
  });

  it('falls back to defaults for invalid values', () => {
    const env = withEnv({
      [ENGINE_ENV.mode]: 'invalid-mode',
      [ENGINE_ENV.mag]: 'nope',
      [ENGINE_ENV.sag]: 'wrong'
    });
    const result = resolveEngineSelection(env);
    expect(result).toStrictEqual(DEFAULT_ENGINE_SELECTION);
  });
});
