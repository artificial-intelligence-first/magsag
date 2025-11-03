import { Writable } from 'node:stream';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  flowAvailableHandler,
  parseFlowAvailable
} from './flow-available.js';
import { flowGateHandler } from './flow-gate.js';
import { flowRunHandler, parseFlowRun } from './flow-run.js';
import { flowSummarizeHandler } from './flow-summarize.js';
import { flowValidateHandler, parseFlowValidate } from './flow-validate.js';

const infoMock = vi.hoisted(() => vi.fn());
const validateMock = vi.hoisted(() => vi.fn());
const runMock = vi.hoisted(() => vi.fn());

vi.mock('../flow/runner.js', () => ({
  FlowRunner: vi.fn().mockImplementation(() => ({
    info: infoMock,
    validate: validateMock,
    run: runMock
  }))
}));

const summarizeMock = vi.hoisted(() => vi.fn());
vi.mock('@magsag/observability', () => ({
  summarizeFlowRuns: summarizeMock
}));

const evaluateMock = vi.hoisted(() => vi.fn());
vi.mock('@magsag/governance', () => ({
  evaluateFlowSummary: evaluateMock
}));

const collectStream = () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      callback();
    }
  });
  return { stream, chunks };
};

const streams = () => {
  const stdout = collectStream();
  const stderr = collectStream();
  return { stdout, stderr, streams: { stdout: stdout.stream, stderr: stderr.stream } };
};

afterEach(() => {
  infoMock.mockReset();
  validateMock.mockReset();
  runMock.mockReset();
  summarizeMock.mockReset();
  evaluateMock.mockReset();
});

describe('flow available', () => {
  it('parses without arguments', async () => {
    const parsed = await parseFlowAvailable([]);
    expect(parsed.kind).toBe('flow:available');
  });

  it('reports availability details', async () => {
    infoMock.mockResolvedValue({
      name: 'flow-runner',
      binary: '/usr/local/bin/flowctl',
      version: '1.2.3',
      capabilities: ['dry-run']
    });
    const ctx = streams();
    const code = await flowAvailableHandler({ kind: 'flow:available' }, ctx.streams);
    expect(code).toBe(0);
    expect(ctx.stdout.chunks.join('')).toContain('yes');
  });

  it('handles missing runner gracefully', async () => {
    infoMock.mockResolvedValue(undefined);
    const ctx = streams();
    await flowAvailableHandler({ kind: 'flow:available' }, ctx.streams);
    expect(ctx.stdout.chunks.join('')).toContain('no');
  });
});

describe('flow validate', () => {
  it('parses flags and args', async () => {
    const parsed = await parseFlowValidate(['flow.yaml', '--schema', 'schema.json']);
    expect(parsed.flowPath).toBe('flow.yaml');
    expect(parsed.schema).toBe('schema.json');
  });

  it('emits validation output', async () => {
    validateMock.mockResolvedValue({ ok: true, stdout: 'OK', stderr: '' });
    const ctx = streams();
    const code = await flowValidateHandler(
      { kind: 'flow:validate', flowPath: 'flow.yaml', schema: undefined },
      ctx.streams
    );
    expect(code).toBe(0);
    expect(validateMock).toHaveBeenCalledWith('flow.yaml', { schema: undefined });
    expect(ctx.stdout.chunks.join('')).toContain('OK');
  });

  it('propagates validation failures', async () => {
    validateMock.mockResolvedValue({ ok: false, stdout: '', stderr: 'broken' });
    const ctx = streams();
    const code = await flowValidateHandler(
      { kind: 'flow:validate', flowPath: 'flow.yaml', schema: undefined },
      ctx.streams
    );
    expect(code).toBe(1);
    expect(ctx.stderr.chunks.join('')).toContain('broken');
  });
});

describe('flow run', () => {
  it('parses run options', async () => {
    const parsed = await parseFlowRun([
      'flow.yaml',
      '--dry-run',
      '--only',
      'hello',
      '--continue-from',
      'world'
    ]);
    expect(parsed.flowPath).toBe('flow.yaml');
    expect(parsed.dryRun).toBe(true);
    expect(parsed.only).toBe('hello');
    expect(parsed.continueFrom).toBe('world');
  });

  it('prints command output and respects exit code', async () => {
    runMock.mockResolvedValue({ ok: false, stdout: 'output', stderr: 'error' });
    const ctx = streams();
    const code = await flowRunHandler(
      {
        kind: 'flow:run',
        flowPath: 'flow.yaml',
        dryRun: true,
        only: undefined,
        continueFrom: undefined
      },
      ctx.streams
    );
    expect(code).toBe(1);
    expect(ctx.stdout.chunks.join('')).toContain('output');
    expect(ctx.stderr.chunks.join('')).toContain('error');
  });
});

describe('flow summarize', () => {
  it('writes JSON summary and optional output file', async () => {
    summarizeMock.mockResolvedValue({ runs: 1 });
    const dir = await mkdtemp(join(tmpdir(), 'magsag-cli-flow-summarize-'));
    const outputPath = join(dir, 'summary.json');
    const ctx = streams();
    const code = await flowSummarizeHandler(
      { kind: 'flow:summarize', base: '.runs', output: outputPath },
      ctx.streams
    );
    expect(code).toBe(0);
    expect(summarizeMock).toHaveBeenCalledWith('.runs');
    const written = await readFile(outputPath, 'utf8');
    expect(written).toContain('"runs": 1');
    expect(ctx.stdout.chunks.join('')).toContain('"runs": 1');
  });
});

describe('flow gate', () => {
  it('returns success when there are no issues', async () => {
    evaluateMock.mockResolvedValue([]);
    const ctx = streams();
    const code = await flowGateHandler(
      { kind: 'flow:gate', summaryPath: 'summary.json', policyPath: undefined },
      ctx.streams
    );
    expect(code).toBe(0);
    expect(ctx.stdout.chunks.join('')).toContain('PASSED');
  });

  it('returns failure exit code when issues found', async () => {
    evaluateMock.mockResolvedValue(['runs 0 < min 1']);
    const ctx = streams();
    const code = await flowGateHandler(
      { kind: 'flow:gate', summaryPath: 'summary.json', policyPath: undefined },
      ctx.streams
    );
    expect(code).toBe(2);
    expect(ctx.stdout.chunks.join('')).toContain('FAILED');
  });
});
