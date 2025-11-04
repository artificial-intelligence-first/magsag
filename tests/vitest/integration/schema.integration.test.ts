import { describe, expect, it } from 'vitest';
import {
  engineSelectionSchema,
  runnerEventSchema
} from '@magsag/schema';
import { ENGINE_ENV, resolveEngineSelection } from '@magsag/core';

const makeEnv = (mode: string, mag: string, sag: string) => ({
  [ENGINE_ENV.mode]: mode,
  [ENGINE_ENV.mag]: mag,
  [ENGINE_ENV.sag]: sag
});

describe('schema integration', () => {
  it('validates engine selections derived from core helpers', () => {
    const env = makeEnv('oss', 'claude-cli', 'codex-cli');
    const selection = resolveEngineSelection(env);
    const parsed = engineSelectionSchema.parse(selection);

    expect(parsed).toStrictEqual({
      mode: 'oss',
      mag: 'claude-cli',
      sag: 'codex-cli'
    });
  });

  it('guards runner event payloads across packages', () => {
    const event = runnerEventSchema.parse({
      type: 'message',
      role: 'assistant',
      content: 'hello!'
    });

    expect(event).toStrictEqual({
      type: 'message',
      role: 'assistant',
      content: 'hello!'
    });

    expect(() =>
      runnerEventSchema.parse({
        type: 'error',
        error: {}
      })
    ).toThrowError();
  });
});
