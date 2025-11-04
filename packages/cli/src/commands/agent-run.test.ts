import { Writable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryRunnerRegistry } from '@magsag/core';
import type { Runner, RunnerEvent, RunSpec } from '@magsag/core';

import { agentRunHandler, parseAgentRun } from './agent-run.js';
import * as registryModule from '../registry.js';

const collectStream = () => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(
        typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
      );
      callback();
    }
  });
  return { stream, chunks };
};

const createStubRunner = (events: RunnerEvent[]): Runner => ({
  async *run(_spec: RunSpec) {
    void _spec;
    await Promise.resolve();
    for (const event of events) {
      yield event;
    }
  }
});

describe('parseAgentRun', () => {
  it('produces a run spec with defaults applied', async () => {
    const parsed = await parseAgentRun(['Hello, world!']);
    expect(parsed.spec.prompt).toBe('Hello, world!');
    expect(parsed.spec.engine).toBe('codex-cli');
    expect(parsed.spec.repo).toBe(process.cwd());
  });

  it('rejects invalid engines', async () => {
    await expect(parseAgentRun(['--engine', 'invalid', 'prompt'])).rejects.toThrow(
      /Expected --engine=invalid/
    );
  });
});

describe('agentRunHandler', () => {
  it('streams runner events to the provided streams', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register({
      id: 'codex-cli',
      create: () =>
        createStubRunner([
          { type: 'log', data: 'starting' },
          { type: 'message', role: 'assistant', content: 'hello' },
          {
            type: 'diff',
            files: [{ path: 'README.md', patch: '+ hello world' }]
          },
          { type: 'done', sessionId: 'abc' }
        ])
    });

    const registrySpy = vi
      .spyOn(registryModule, 'getDefaultRunnerRegistry')
      .mockReturnValue(registry);

    const stdout = collectStream();
    const stderr = collectStream();

    const parsed = await parseAgentRun(['Sample prompt']);
    const exitCode = await agentRunHandler(parsed, {
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(0);
    expect(stdout.chunks.join('')).toContain('hello');
    expect(stdout.chunks.join('')).toContain('diff -- README.md');
    expect(stderr.chunks.join('')).toContain('starting');
    expect(stderr.chunks.join('')).toContain('Run completed (session=abc)');

    registrySpy.mockRestore();
  });

  it('returns non-zero exit code when runner emits error', async () => {
    const registry = new InMemoryRunnerRegistry();
    registry.register({
      id: 'codex-cli',
      create: () =>
        createStubRunner([
          { type: 'error', error: { message: 'boom' } },
          { type: 'done' }
        ])
    });

    const registrySpy = vi
      .spyOn(registryModule, 'getDefaultRunnerRegistry')
      .mockReturnValue(registry);

    const stdout = collectStream();
    const stderr = collectStream();

    const parsed = await parseAgentRun(['Another prompt']);
    const exitCode = await agentRunHandler(parsed, {
      stdout: stdout.stream,
      stderr: stderr.stream
    });

    expect(exitCode).toBe(1);
    expect(stderr.chunks.join('')).toContain('Error: boom');

    registrySpy.mockRestore();
  });
});
