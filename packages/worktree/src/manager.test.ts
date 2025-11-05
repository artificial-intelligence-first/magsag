import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
  const { promisify } = await vi.importActual<typeof import('node:util')>('node:util');
  (execFileMock as any)[promisify.custom] = execFileAsyncMock;
  return {
    ...actual,
    execFile: execFileMock
  };
});

import { WorktreeManager, JsonWorktreeStore } from './manager.js';

describe('WorktreeManager', () => {
  let manager: WorktreeManager;
  let store: JsonWorktreeStore;
  let testDir: string;
  let indexPath: string;

  beforeEach(() => {
    execFileMock.mockClear();
    execFileAsyncMock.mockReset();
    execFileAsyncMock.mockImplementation(async () => ({ stdout: '', stderr: '' }));
  });

  beforeEach(async () => {
    // Create temp directory for test
    testDir = join(tmpdir(), `magsag-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    indexPath = join(testDir, 'index.json');

    store = new JsonWorktreeStore(indexPath);
    manager = new WorktreeManager(
      {
        root: testDir,
        baseRef: 'main',
        maxAlive: 3,
        ttlOkMs: 1000,     // 1 second for testing
        ttlFailedMs: 2000, // 2 seconds for testing
        keepOnFailure: true,
        gcOnStart: false,
        gcOnExit: false
      },
      store
    );
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Store operations', () => {
    it('should create and read records', async () => {
      const record = {
        id: 'test-1',
        branch: 'test-branch',
        path: '/test/path',
        planId: 'plan-1',
        stepId: 'step-1',
        package: '@magsag/test',
        state: 'active' as const,
        createdAt: Date.now(),
        ttlMs: 1000,
        pinned: false
      };

      await store.put(record);
      const retrieved = await store.get('test-1');

      expect(retrieved).toEqual(record);
    });

    it('should list all records', async () => {
      const records = [
        {
          id: 'test-1',
          branch: 'branch-1',
          path: '/path/1',
          planId: 'plan-1',
          stepId: 'step-1',
          state: 'active' as const,
          createdAt: Date.now(),
          ttlMs: 1000
        },
        {
          id: 'test-2',
          branch: 'branch-2',
          path: '/path/2',
          planId: 'plan-2',
          stepId: 'step-2',
          state: 'merged' as const,
          createdAt: Date.now() - 2000,
          ttlMs: 1000
        }
      ];

      for (const record of records) {
        await store.put(record);
      }

      const all = await store.all();
      expect(all).toHaveLength(2);
      expect(all.map(r => r.id).sort()).toEqual(['test-1', 'test-2']);
    });

    it('should delete records', async () => {
      const record = {
        id: 'test-1',
        branch: 'test-branch',
        path: '/test/path',
        planId: 'plan-1',
        stepId: 'step-1',
        state: 'active' as const,
        createdAt: Date.now(),
        ttlMs: 1000
      };

      await store.put(record);
      await store.delete('test-1');

      const retrieved = await store.get('test-1');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('Worktree allocation', () => {
    it('should allocate a new worktree', async () => {
      const result = await manager.allocate('plan-1', 'step-1', '@magsag/test');

      expect(result).toBeDefined();
      expect(result.planId).toBe('plan-1');
      expect(result.stepId).toBe('step-1');
      expect(result.package).toBe('@magsag/test');
      expect(result.state).toBe('active');
      expect(result.branch).toMatch(/^magsag\/plan-1\/@magsag\/test\//);

      // Verify stored in index
      const stored = await store.get(result.id);
      expect(stored).toEqual(result);
    });

    it('should enforce max alive limit', async () => {
      // Create 3 active worktrees (max limit)
      for (let i = 1; i <= 3; i++) {
        await manager.allocate(`plan-${i}`, `step-${i}`, `@magsag/test-${i}`);
      }

      const before = await store.all();
      expect(before.filter(r => r.state === 'active')).toHaveLength(3);

      // Allocating a 4th should trigger eviction
      await manager.allocate('plan-4', 'step-4', '@magsag/test-4');

      const after = await store.all();
      const activeAfter = after.filter(r => r.state === 'active');

      // Should still have max 3 active
      expect(activeAfter.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Finalization', () => {
    it('should mark successful worktrees as merged', async () => {
      execFileAsyncMock.mockImplementation(async (cmd, args) => {
        if (cmd === 'git' && Array.isArray(args) && args[0] === 'merge-base') {
          throw new Error('not merged');
        }

        return { stdout: '', stderr: '' };
      });

      const record = {
        id: 'test-1',
        branch: 'test-branch',
        path: '/test/path',
        planId: 'plan-1',
        stepId: 'step-1',
        state: 'active' as const,
        createdAt: Date.now(),
        ttlMs: 1000
      };

      await store.put(record);
      execFileAsyncMock.mockRejectedValueOnce(new Error('not merged'));
      await manager.finalize(record, { ok: true });

      const updated = await store.get('test-1');
      expect(updated?.state).toBe('merged');
      expect(updated?.lastActiveAt).toBeDefined();
    });

    it('should mark failed worktrees appropriately', async () => {
      const record = {
        id: 'test-1',
        branch: 'test-branch',
        path: '/test/path',
        planId: 'plan-1',
        stepId: 'step-1',
        state: 'active' as const,
        createdAt: Date.now(),
        ttlMs: 1000
      };

      await store.put(record);
      await manager.finalize(record, { ok: false });

      const updated = await store.get('test-1');
      expect(updated?.state).toBe('failed');
      expect(updated?.ttlMs).toBe(2000); // Failed TTL
    });
  });

  describe('Cleanup safeguards', () => {
    it('should keep record when worktree removal fails', async () => {
      const record = {
        id: 'cleanup-1',
        branch: 'cleanup-branch',
        path: '/tmp/cleanup-branch',
        planId: 'plan-cleanup',
        stepId: 'step-cleanup',
        state: 'failed' as const,
        createdAt: Date.now(),
        ttlMs: 1000
      };

      await store.put(record);
      execFileAsyncMock.mockRejectedValueOnce(new Error('locked directory'));

      await (manager as any).tryCleanup(record);

      const remaining = await store.get(record.id);
      expect(remaining).toBeDefined();
    });

    it('should keep record when branch deletion fails for unexpected reason', async () => {
      const record = {
        id: 'cleanup-2',
        branch: 'cleanup-branch-2',
        path: '/tmp/cleanup-branch-2',
        planId: 'plan-cleanup-2',
        stepId: 'step-cleanup-2',
        state: 'failed' as const,
        createdAt: Date.now(),
        ttlMs: 1000
      };

      await store.put(record);
      execFileAsyncMock
        .mockResolvedValueOnce({ stdout: '', stderr: '' })
        .mockRejectedValueOnce(Object.assign(new Error('permission denied'), { stderr: 'fatal: permission denied' }));

      await (manager as any).tryCleanup(record);

      const remaining = await store.get(record.id);
      expect(remaining).toBeDefined();
    });
  });

  describe('Garbage collection', () => {
    it('should remove expired worktrees', async () => {
      const now = Date.now();

      const records = [
        {
          id: 'expired-1',
          branch: 'branch-1',
          path: '/path/1',
          planId: 'plan-1',
          stepId: 'step-1',
          state: 'merged' as const,
          createdAt: now - 5000, // 5 seconds ago
          ttlMs: 1000, // 1 second TTL
          lastActiveAt: now - 5000
        },
        {
          id: 'active-1',
          branch: 'branch-2',
          path: '/path/2',
          planId: 'plan-2',
          stepId: 'step-2',
          state: 'active' as const,
          createdAt: now,
          ttlMs: 10000 // 10 second TTL
        }
      ];

      for (const record of records) {
        await store.put(record);
      }

      const deleteSpy = vi.spyOn(store, 'delete');
      await manager.gc();
      expect(deleteSpy).toHaveBeenCalledWith('expired-1');
      deleteSpy.mockRestore();
      const remaining = await store.all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('active-1');
    });

    it('should clean expired merged worktrees even when merge-base reports not ancestor', async () => {
      execFileAsyncMock.mockImplementation(async (_cmd, args) => {
        if (args[0] === 'merge-base') {
          const error = Object.assign(new Error('not merged'), { code: 1 });
          throw error;
        }
        return { stdout: '', stderr: '' };
      });

      const now = Date.now();
      const record = {
        id: 'expired-merged',
        branch: 'branch-merged',
        path: '/path/merged',
        planId: 'plan-merged',
        stepId: 'step-merged',
        state: 'merged' as const,
        createdAt: now - 10_000,
        lastActiveAt: now - 10_000,
        ttlMs: 1_000
      };

      await store.put(record);

      const deleteSpy = vi.spyOn(store, 'delete');
      await manager.gc();

      expect(deleteSpy).toHaveBeenCalledWith('expired-merged');
      const remaining = await store.all();
      expect(remaining.find((r) => r.id === 'expired-merged')).toBeUndefined();
      deleteSpy.mockRestore();
    });

    it('should respect pinned flag', async () => {
      const now = Date.now();

      const pinnedRecord = {
        id: 'pinned-1',
        branch: 'branch-1',
        path: '/path/1',
        planId: 'plan-1',
        stepId: 'step-1',
        state: 'active' as const,
        createdAt: now - 10000, // Old
        ttlMs: 1000, // Expired TTL
        pinned: true // But pinned
      };

      await store.put(pinnedRecord);
      const cleanupSpy = vi.spyOn(manager as any, 'tryCleanup');

      await manager.gc();

      const remaining = await store.all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('pinned-1');
      expect(cleanupSpy).not.toHaveBeenCalled();
      cleanupSpy.mockRestore();
    });
  });

  describe('Prune operation', () => {
    it('should force cleanup of failed worktrees', async () => {
      const records = [
        {
          id: 'failed-1',
          branch: 'branch-1',
          path: '/path/1',
          planId: 'plan-1',
          stepId: 'step-1',
          state: 'failed' as const,
          createdAt: Date.now(),
          ttlMs: 10000 // Not expired yet
        },
        {
          id: 'active-1',
          branch: 'branch-2',
          path: '/path/2',
          planId: 'plan-2',
          stepId: 'step-2',
          state: 'active' as const,
          createdAt: Date.now(),
          ttlMs: 10000
        }
      ];

      for (const record of records) {
        await store.put(record);
      }

      await manager.prune();

      const remaining = await store.all();
      // Active should remain, failed should be removed
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('active-1');
    });

    it('should skip pinned worktrees even when expired or failed', async () => {
      const records = [
        {
          id: 'pinned-expired',
          branch: 'branch-pinned',
          path: '/path/pinned',
          planId: 'plan-pinned',
          stepId: 'step-pinned',
          state: 'expired' as const,
          createdAt: Date.now() - 60_000,
          ttlMs: 1,
          pinned: true
        },
        {
          id: 'pinned-failed',
          branch: 'branch-failed',
          path: '/path/failed',
          planId: 'plan-failed',
          stepId: 'step-failed',
          state: 'failed' as const,
          createdAt: Date.now() - 60_000,
          ttlMs: 1,
          pinned: true
        }
      ];

      for (const record of records) {
        await store.put(record);
      }

      const cleanupSpy = vi.spyOn(manager as any, 'tryCleanup');

      await manager.prune();

      expect(cleanupSpy).not.toHaveBeenCalled();
      const remaining = await store.all();
      expect(remaining).toHaveLength(2);
      expect(new Set(remaining.map((r) => r.id))).toEqual(
        new Set(['pinned-expired', 'pinned-failed'])
      );
      cleanupSpy.mockRestore();
    });
  });

  describe('Force cleanup operation', () => {
    it('should remove all non-pinned worktrees', async () => {
      const records = [
        {
          id: 'active-1',
          branch: 'branch-active',
          path: '/path/active',
          planId: 'plan-active',
          stepId: 'step-active',
          state: 'active' as const,
          createdAt: Date.now(),
          ttlMs: 10000
        },
        {
          id: 'merged-1',
          branch: 'branch-merged',
          path: '/path/merged',
          planId: 'plan-merged',
          stepId: 'step-merged',
          state: 'merged' as const,
          createdAt: Date.now(),
          ttlMs: 10000
        },
        {
          id: 'pinned-1',
          branch: 'branch-pinned',
          path: '/path/pinned',
          planId: 'plan-pinned',
          stepId: 'step-pinned',
          state: 'active' as const,
          createdAt: Date.now(),
          ttlMs: 10000,
          pinned: true
        }
      ];

      for (const record of records) {
        await store.put(record);
      }

      const cleanupSpy = vi.spyOn(manager as any, 'tryCleanup');

      await manager.forceCleanup();

      const remaining = await store.all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('pinned-1');
      expect(cleanupSpy).toHaveBeenCalled();
      for (const call of cleanupSpy.mock.calls) {
        expect(call[1]).toEqual({ force: true });
      }

      cleanupSpy.mockRestore();
    });
  });
});
