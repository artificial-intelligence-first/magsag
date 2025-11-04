import { describe, expect, it, vi } from 'vitest';
import type { RunSpec } from '@magsag/core';
import type { RunnerEvent } from '@magsag/core';
import { InMemorySessionStore } from './session-store.js';

const baseSpec = (): RunSpec => ({
  engine: 'codex-cli',
  repo: '/tmp/repo',
  prompt: 'resume test'
});

const logEvent = (data: string): RunnerEvent => ({
  type: 'log',
  data
});

describe('InMemorySessionStore', () => {
  it('preserves existing session data when recreating with the same id', async () => {
    const store = new InMemorySessionStore();
    const spec = baseSpec();

    await store.create(spec, { id: 'session-1' });
    await store.append('session-1', logEvent('first run'));

    const before = await store.get('session-1');
    expect(before?.events).toHaveLength(1);
    expect(before?.status).toBe('running');

    const resumeSpec: RunSpec = {
      ...spec,
      prompt: 'resumed run',
      resumeId: 'session-1'
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-11-15T10:00:00Z'));

    const resumed = await store.create(resumeSpec, { id: 'session-1' });
    expect(resumed.events).toHaveLength(1);
    expect(resumed.status).toBe('running');
    expect(resumed.spec.prompt).toBe('resumed run');

    vi.useRealTimers();

    await store.append('session-1', logEvent('resumed run log'));

    const after = await store.get('session-1');
    expect(after?.events).toHaveLength(2);
    expect(after?.status).toBe('running');
    expect(after?.error).toBeUndefined();
  });

  it('keeps failed status when done events or markCompleted are processed', async () => {
    const store = new InMemorySessionStore();
    const spec = baseSpec();
    await store.create(spec, { id: 'session-fail' });

    await store.append('session-fail', {
      type: 'error',
      error: { message: 'runner failed', code: 'ERR_FAIL' }
    });

    await store.append('session-fail', { type: 'done', sessionId: 'session-fail' });
    await store.markCompleted('session-fail');

    const record = await store.get('session-fail');
    expect(record?.status).toBe('failed');
    expect(record?.error?.message).toBe('runner failed');
    expect(record?.lastEventType).toBe('done');
  });
});
