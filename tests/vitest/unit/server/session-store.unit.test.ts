import { describe, expect, test, vi } from 'vitest';
import type { RunSpec } from '@magsag/core';
import { BoundedSessionStore } from '@magsag/server';

const baseSpec = (): RunSpec => ({
  engine: 'codex-cli',
  repo: '/tmp/repo',
  prompt: 'run bounded session'
});

describe('BoundedSessionStore integration', () => {
  test('exposes droppedEvents metadata when enforcing limits', async () => {
    const store = new BoundedSessionStore({
      maxSessions: 4,
      maxEventsPerSession: 1,
      maxEventBytes: 8 * 1024,
      retentionMs: 5 * 60 * 1000
    });

    await store.create(baseSpec(), { id: 'bounded' });
    await store.append('bounded', { type: 'log', data: 'first-event' });
    await store.append('bounded', { type: 'log', data: 'second-event' });

    const record = await store.get('bounded');
    expect(record?.events).toHaveLength(1);
    expect(record?.events[0]).toEqual({ type: 'log', data: 'second-event' });
    expect(record?.droppedEvents).toBe(1);
  });

  test('renames sessions when runners report alternate ids', async () => {
    const store = new BoundedSessionStore();
    await store.create(baseSpec(), { id: 'original' });

    const nextId = await store.append('original', { type: 'done', sessionId: 'derived' });
    expect(nextId).toBe('derived');
    expect(await store.get('original')).toBeUndefined();
    expect(await store.get('derived')).toBeDefined();
  });

  test('evicts idle sessions once capacity is exceeded', async () => {
    const store = new BoundedSessionStore({ maxSessions: 2 });
    await store.create(baseSpec(), { id: 'running' });
    await store.create(baseSpec(), { id: 'completed' });
    await store.append('completed', { type: 'done', sessionId: 'completed' });

    await store.create(baseSpec(), { id: 'new' });
    const ids = (await store.list()).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['running', 'new']));
    expect(ids).not.toContain('completed');
  });

  test('marks sessions completed and failed explicitly', async () => {
    const store = new BoundedSessionStore();
    await store.create(baseSpec(), { id: 'markable' });

    await store.markCompleted('markable');
    expect((await store.get('markable'))?.status).toBe('completed');

    await store.markFailed('markable', { message: 'boom', code: 'ERR' });
    const record = await store.get('markable');
    expect(record?.status).toBe('failed');
    expect(record?.error?.message).toBe('boom');
  });

  test('prunes stale sessions using retention window', async () => {
    vi.useFakeTimers();
    const store = new BoundedSessionStore({ retentionMs: 60 * 1000 });
    await store.create(baseSpec(), { id: 'stale' });
    await store.append('stale', { type: 'log', data: 'ping' });

    vi.advanceTimersByTime(61 * 1000);
    await store.create(baseSpec(), { id: 'fresh' });
    vi.useRealTimers();

    const ids = (await store.list()).map((item) => item.id);
    expect(ids).toContain('fresh');
    expect(ids).not.toContain('stale');
  });

  test('resetting a session id keeps running status', async () => {
    const store = new BoundedSessionStore();
    await store.create(baseSpec(), { id: 'reuse' });
    await store.append('reuse', { type: 'log', data: 'first' });

    await store.create(baseSpec(), { id: 'reuse' });
    const record = await store.get('reuse');
    expect(record?.events).toHaveLength(1);
    expect(record?.status).toBe('running');
  });

  test('records error events with details and keeps failure status', async () => {
    const store = new BoundedSessionStore();
    await store.create(baseSpec(), { id: 'error-case' });

    await store.append('error-case', {
      type: 'error',
      error: { message: 'failure', code: 'ERR_CASE', details: { info: 'details' } }
    });
    await store.append('error-case', { type: 'done', sessionId: 'error-case' });

    const record = await store.get('error-case');
    expect(record?.status).toBe('failed');
    expect(record?.error?.code).toBe('ERR_CASE');
  });

  test('list returns sessions sorted by most recent activity', async () => {
    const store = new BoundedSessionStore();
    vi.useFakeTimers();
    await store.create(baseSpec(), { id: 'first' });
    vi.advanceTimersByTime(1000);
    await store.create(baseSpec(), { id: 'second' });
    vi.advanceTimersByTime(1000);
    await store.append('first', { type: 'log', data: 'update' });
    vi.useRealTimers();

    const ids = (await store.list()).map((item) => item.id);
    expect(ids[0]).toBe('first');
  });
});
