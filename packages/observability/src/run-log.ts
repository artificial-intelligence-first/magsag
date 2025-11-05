import { promises as fs } from 'node:fs';
import type { DelegationEvent, DelegationResult } from '@magsag/core';

export interface RunLogEntry {
  runId: string;
  ts: string;
  event: DelegationEvent;
}

export interface RunTotals {
  completed: number;
  failed: number;
  skipped: number;
}

export interface RunSummary {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  totals: RunTotals;
  results: DelegationResult[];
  usage?: Record<string, unknown>;
}

export class RunLogCollector {
  private readonly runId: string;
  private readonly entries: RunLogEntry[] = [];
  private readonly results = new Map<string, DelegationResult>();
  private readonly usage = new Map<string, unknown>();
  private startedAt?: Date;
  private finishedAt?: Date;

  constructor(runId: string) {
    this.runId = runId;
  }

  record(event: DelegationEvent, timestamp = new Date()): void {
    if (!this.startedAt) {
      this.startedAt = timestamp;
    }
    this.finishedAt = timestamp;

    this.entries.push({
      runId: this.runId,
      ts: timestamp.toISOString(),
      event
    });

    if (event.type === 'result') {
      this.results.set(event.result.subtaskId, event.result);
    } else if (event.type === 'runner' && event.event.type === 'done') {
      if (event.event.stats) {
        this.usage.set(event.subtaskId, event.event.stats);
      }
    }
  }

  toJsonLines(): string {
    return this.entries.map((entry) => JSON.stringify(entry)).join('\n');
  }

  async writeToFile(filePath: string): Promise<void> {
    const payload = `${this.toJsonLines()}\n`;
    await fs.writeFile(filePath, payload, 'utf8');
  }

  summary(): RunSummary {
    const totals: RunTotals = {
      completed: 0,
      failed: 0,
      skipped: 0
    };

    for (const result of this.results.values()) {
      if (result.status in totals) {
        totals[result.status as keyof RunTotals] += 1;
      }
    }

    const startedAtIso = this.startedAt?.toISOString();
    const finishedAtIso = this.finishedAt?.toISOString();
    const durationMs =
      this.startedAt && this.finishedAt
        ? Math.max(0, this.finishedAt.getTime() - this.startedAt.getTime())
        : undefined;

    return {
      runId: this.runId,
      startedAt: startedAtIso ?? new Date().toISOString(),
      finishedAt: finishedAtIso,
      durationMs,
      totals,
      results: Array.from(this.results.values()),
      usage: Object.fromEntries(this.usage.entries())
    };
  }
}

export const parseRunLogLines = (content: string): RunLogEntry[] =>
  content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as RunLogEntry);

export const loadRunLog = async (filePath: string): Promise<{
  entries: RunLogEntry[];
  summary: RunSummary;
}> => {
  const raw = await fs.readFile(filePath, 'utf8');
  const entries = parseRunLogLines(raw);
  if (entries.length === 0) {
    throw new Error(`Run log '${filePath}' is empty.`);
  }

  const collector = new RunLogCollector(entries[0].runId);
  for (const entry of entries) {
    collector.record(entry.event, new Date(entry.ts));
  }

  return {
    entries,
    summary: collector.summary()
  };
};
