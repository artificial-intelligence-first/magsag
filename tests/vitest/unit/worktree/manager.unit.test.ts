import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import { JsonWorktreeStore, WorktreeManager } from '@magsag/worktree/manager';

const execFileAsyncMock = vi.hoisted(() =>
  vi.fn<
    [cmd: string, args: string[]],
    Promise<{ stdout: string; stderr: string }>
  >()
);

const execFileMock = vi.hoisted(() =>
  vi.fn((...args: any[]) => {
    const callback = args.at(-1);
    if (typeof callback === 'function') {
      callback(null, '', '');
    }
  })
);

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  (execFileMock as any)[promisify.custom] = execFileAsyncMock;
  return { ...actual, execFile: execFileMock };
});

describe('Worktree primitives', () => {
  let tempDir: string;
  let store: JsonWorktreeStore;

  beforeEach(async () => {
    execFileMock.mockClear();
    execFileAsyncMock.mockReset();
    execFileAsyncMock.mockResolvedValue({ stdout: '', stderr: '' });
    tempDir = await fs.mkdtemp(join(tmpdir(), 'magsag-worktree-'));
    store = new JsonWorktreeStore(join(tempDir, 'index.json'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('JsonWorktreeStore caches reads and persists writes', async () => {
    await store.put({
      id: 'cache-1',
      branch: 'branch',
      path: '/tmp/path',
      planId: 'plan',
      stepId: 'step',
      state: 'active',
      createdAt: Date.now(),
      ttlMs: 1000
    });

    const first = await store.get('cache-1');
    expect(first?.branch).toBe('branch');

    await store.put({
      id: 'cache-1',
      branch: 'updated-branch',
      path: '/tmp/path',
      planId: 'plan',
      stepId: 'step',
      state: 'active',
      createdAt: first!.createdAt,
      ttlMs: 1000
    });

    const second = await store.get('cache-1');
    expect(second?.branch).toBe('updated-branch');

    await store.delete('missing-id');
    await store.delete('cache-1');

    const all = await store.all();
    expect(all).toEqual([]);
  });

  test('WorktreeManager defaults baseRef to main', async () => {
    const manager = new WorktreeManager(
      {
        root: tempDir,
        gcOnStart: false,
        gcOnExit: false
      },
      store
    );

    await manager.allocate('plan', 'step');

    const worktreeCall = execFileAsyncMock.mock.calls.find(
      ([cmd, args]) =>
        cmd === 'git' && Array.isArray(args) && args[0] === 'worktree' && args[1] === 'add'
    );

    expect(worktreeCall).toBeDefined();
    const args = worktreeCall?.[1] as string[] | undefined;
    expect(args?.at(-1)).toBe('main');
  });
});
