import { describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promises as fs } from 'node:fs';
import type { DelegationEvent, DelegationResult, RunnerEvent } from '@magsag/core';
import {
  RunLogCollector,
  loadRunLog,
  parseRunLogLines
} from './run-log.js';

const sampleRunnerDone = (subtaskId: string): DelegationEvent => ({
  type: 'runner',
  subtaskId,
  event: {
    type: 'done',
    stats: {
      usage: {
        inputTokens: 12,
        outputTokens: 24
      }
    }
  } as RunnerEvent
});

describe('RunLogCollector', () => {
  it('records events and produces summaries', () => {
    const collector = new RunLogCollector('run-1');

    const queued: DelegationEvent = {
      type: 'state',
      subtaskId: 'subtask-1',
      state: 'queued'
    };

    const result: DelegationResult = {
      subtaskId: 'subtask-1',
      status: 'completed'
    };

    collector.record(queued);
    collector.record(sampleRunnerDone('subtask-1'));
    collector.record({ type: 'result', result });

    const summary = collector.summary();
    expect(summary.runId).toBe('run-1');
    expect(summary.totals.completed).toBe(1);
    expect(summary.totals.failed).toBe(0);
    expect(summary.results).toHaveLength(1);
    expect(summary.usage).toHaveProperty('subtask-1');

    const lines = collector.toJsonLines();
    const parsed = parseRunLogLines(lines);
    expect(parsed).toHaveLength(3);
  });

  it('loads run logs from disk', async () => {
    const collector = new RunLogCollector('run-2');
    collector.record({
      type: 'state',
      subtaskId: 'subtask-1',
      state: 'running'
    });
    collector.record({
      type: 'result',
      result: {
        subtaskId: 'subtask-1',
        status: 'failed',
        detail: 'boom'
      }
    });

    const tempFile = join(tmpdir(), `run-log-test-${Date.now()}.jsonl`);
    await collector.writeToFile(tempFile);

    const loaded = await loadRunLog(tempFile);
    expect(loaded.entries).toHaveLength(2);
    expect(loaded.summary.totals.failed).toBe(1);

    await fs.unlink(tempFile);
  });
});
