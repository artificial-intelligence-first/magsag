import { describe, expect, it, vi } from 'vitest';
import type { RunSpec } from '@magsag/core';
import type { RunnerEvent } from '@magsag/core';
import { BoundedSessionStore, InMemorySessionStore } from './session-store.js';

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

describe('BoundedSessionStore', () => {
  it('enforces per-session limits and tracks dropped events', async () => {
    const store = new BoundedSessionStore({
      maxSessions: 8,
      maxEventsPerSession: 2,
      maxEventBytes: 32 * 1024
    });
    await store.create(baseSpec(), { id: 'bounded-1' });

    await store.append('bounded-1', logEvent('event-1'));
    await store.append('bounded-1', logEvent('event-2'));
    await store.append('bounded-1', logEvent('event-3'));

    const record = await store.get('bounded-1');
    expect(record?.events).toHaveLength(2);
    expect(record?.events.map((evt) => (evt.type === 'log' ? evt.data : undefined))).toEqual([
      'event-2',
      'event-3'
    ]);
    expect(record?.droppedEvents).toBe(1);
  });

  it('evicts completed sessions when exceeding capacity', async () => {
    const store = new BoundedSessionStore({
      maxSessions: 2,
      maxEventsPerSession: 10,
      maxEventBytes: 128 * 1024
    });
    await store.create(baseSpec(), { id: 'session-a' });
    await store.append('session-a', { type: 'done', sessionId: 'session-a' });

    await store.create(baseSpec(), { id: 'session-b' });
    await store.create(baseSpec(), { id: 'session-c' });

    const sessions = await store.list();
    const ids = sessions.map((session) => session.id);
    expect(ids).not.toContain('session-a');
    expect(ids).toEqual(expect.arrayContaining(['session-b', 'session-c']));
  });

  it('drops stale sessions beyond retention window', async () => {
    vi.useFakeTimers();
    const store = new BoundedSessionStore({
      retentionMs: 60 * 1000,
      maxSessions: 5
    });

    await store.create(baseSpec(), { id: 'stale-session' });
    await store.append('stale-session', logEvent('keep-alive'));

    vi.advanceTimersByTime(120 * 1000);
    await store.create(baseSpec(), { id: 'fresh-session' });
    vi.useRealTimers();

    const sessions = await store.list();
    const ids = sessions.map((session) => session.id);
    expect(ids).toContain('fresh-session');
    expect(ids).not.toContain('stale-session');
  });

  it('applies backpressure based on aggregate payload size', async () => {
    const store = new BoundedSessionStore({
      maxSessions: 5,
      maxEventsPerSession: 10,
      maxEventBytes: 4096
    });

    const largeA = 'a'.repeat(3000);
    const largeB = 'b'.repeat(3000);

    await store.create(baseSpec(), { id: 'bytes-session' });

    await store.append('bytes-session', logEvent(largeA));
    await store.append('bytes-session', logEvent(largeB));

    const record = await store.get('bytes-session');
    expect(record?.events).toHaveLength(1);
    expect(record?.events[0]).toEqual({ type: 'log', data: largeB });
    expect(record?.droppedEvents).toBe(1);
  });

  it('renames session when done event carries new id', async () => {
    const store = new BoundedSessionStore({
      maxSessions: 4,
      maxEventsPerSession: 5,
      maxEventBytes: 4096
    });

    await store.create(baseSpec(), { id: 'session-original' });
    const returnedId = await store.append('session-original', {
      type: 'done',
      sessionId: 'session-new'
    });

    expect(returnedId).toBe('session-new');
    const summary = await store.list();
    expect(summary.map((item) => item.id)).toContain('session-new');
    const original = await store.get('session-original');
    expect(original).toBeUndefined();
  });

  it('marks sessions as completed or failed explicitly', async () => {
    const store = new BoundedSessionStore();
    await store.create(baseSpec(), { id: 'session-mark' });

    await store.markCompleted('session-mark');
    let record = await store.get('session-mark');
    expect(record?.status).toBe('completed');

    await store.markFailed('session-mark', { message: 'explicit failure', code: 'ERR' });
    record = await store.get('session-mark');
    expect(record?.status).toBe('failed');
    expect(record?.error?.message).toBe('explicit failure');

    const summaries = await store.list();
    const summary = summaries.find((item) => item.id === 'session-mark');
    expect(summary?.status).toBe('failed');
  });

  it('enforces global session capacity prioritising active runs', async () => {
    const store = new BoundedSessionStore({
      maxSessions: 2
    });

    await store.create(baseSpec(), { id: 'keep-running' });
    await store.create(baseSpec(), { id: 'completed' });
    await store.append('completed', { type: 'done', sessionId: 'completed' });

    await store.create(baseSpec(), { id: 'new' });

    const summaries = await store.list();
    const ids = summaries.map((item) => item.id);
    expect(ids).toContain('keep-running');
    expect(ids).toContain('new');
    expect(ids).not.toContain('completed');
  });
});
