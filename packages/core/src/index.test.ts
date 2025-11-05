import { describe, expect, it } from 'vitest';

import {
  RUNNER_MCP_ENV,
  TaskQueue,
  applyRunnerMcpEnv,
  buildRunnerMcpEnv,
  type RunnerMcpMetadata
} from './index.js';

const sampleMetadata = (): RunnerMcpMetadata => ({
  runtime: {
    url: 'http://127.0.0.1:4000/mcp',
    host: '127.0.0.1',
    port: 4000,
    path: '/mcp'
  },
  tools: ['one', 'two']
});

describe('buildRunnerMcpEnv', () => {
  it('returns empty record when metadata absent', () => {
    expect(buildRunnerMcpEnv()).toEqual({});
  });

  it('maps runtime metadata to environment variables', () => {
    const env = buildRunnerMcpEnv(sampleMetadata());
    expect(env).toEqual({
      [RUNNER_MCP_ENV.url]: 'http://127.0.0.1:4000/mcp',
      [RUNNER_MCP_ENV.host]: '127.0.0.1',
      [RUNNER_MCP_ENV.port]: '4000',
      [RUNNER_MCP_ENV.path]: '/mcp',
      [RUNNER_MCP_ENV.tools]: 'one,two',
      MCP_SERVER: 'http://127.0.0.1:4000/mcp'
    });
  });

  it('skips tools env when list empty', () => {
    const env = buildRunnerMcpEnv({ ...sampleMetadata(), tools: [] });
    expect(env).not.toHaveProperty(RUNNER_MCP_ENV.tools);
  });
});

describe('applyRunnerMcpEnv', () => {
  it('no-ops when metadata absent', () => {
    const restore = applyRunnerMcpEnv();
    expect(typeof restore).toBe('function');
    expect(() => restore()).not.toThrow();
  });

  it('applies metadata and restores originals', () => {
    const originalUrl = process.env[RUNNER_MCP_ENV.url];
    const originalTools = process.env[RUNNER_MCP_ENV.tools];
    const originalAlias = process.env.MCP_SERVER;
    process.env[RUNNER_MCP_ENV.url] = 'http://previous';
    delete process.env[RUNNER_MCP_ENV.tools];
    delete process.env.MCP_SERVER;

    const restore = applyRunnerMcpEnv(sampleMetadata());
    expect(process.env[RUNNER_MCP_ENV.url]).toBe('http://127.0.0.1:4000/mcp');
    expect(process.env[RUNNER_MCP_ENV.tools]).toBe('one,two');
    expect(process.env.MCP_SERVER).toBe('http://127.0.0.1:4000/mcp');

    restore();

    expect(process.env[RUNNER_MCP_ENV.url]).toBe('http://previous');
    expect(process.env[RUNNER_MCP_ENV.tools]).toBeUndefined();
    expect(process.env.MCP_SERVER).toBeUndefined();

    if (originalUrl === undefined) {
      delete process.env[RUNNER_MCP_ENV.url];
    } else {
      process.env[RUNNER_MCP_ENV.url] = originalUrl;
    }

    if (originalTools === undefined) {
      delete process.env[RUNNER_MCP_ENV.tools];
    } else {
      process.env[RUNNER_MCP_ENV.tools] = originalTools;
    }

    if (originalAlias === undefined) {
      delete process.env.MCP_SERVER;
    } else {
      process.env.MCP_SERVER = originalAlias;
    }
  });

  it('removes tool env when metadata provides no tools', () => {
    const toolsVar = RUNNER_MCP_ENV.tools;
    const initialTools = process.env[toolsVar];
    process.env[toolsVar] = 'stale-tools';

    const restore = applyRunnerMcpEnv({
      runtime: sampleMetadata().runtime
    });

    expect(process.env[toolsVar]).toBeUndefined();

    restore();

    expect(process.env[toolsVar]).toBe('stale-tools');

    if (initialTools === undefined) {
      delete process.env[toolsVar];
    } else {
      process.env[toolsVar] = initialTools;
    }
  });
});

const delay = (ms = 0): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

describe('TaskQueue', () => {
  it('respects the configured concurrency limit', async () => {
    const queue = new TaskQueue(2);
    const started: number[] = [];
    const finished: number[] = [];
    const finishers = new Map<number, () => void>();

    const createTask = (id: number): Promise<number> =>
      queue.push(async () => {
        started.push(id);
        await new Promise<void>(resolve => {
          finishers.set(id, () => {
            finished.push(id);
            resolve();
          });
        });
        return id;
      });

    const p1 = createTask(1);
    const p2 = createTask(2);
    const p3 = createTask(3);

    await delay();

    expect(started).toEqual([1, 2]);
    expect(queue.activeSize).toBe(2);
    expect(queue.pendingSize).toBe(1);

    const finish1 = finishers.get(1);
    expect(finish1).toBeDefined();
    finish1?.();

    await delay();

    expect(started).toEqual([1, 2, 3]);
    expect(queue.activeSize).toBe(2);

    const finish2 = finishers.get(2);
    const finish3 = finishers.get(3);
    expect(finish2).toBeDefined();
    expect(finish3).toBeDefined();

    finish2?.();
    finish3?.();

    await expect(p1).resolves.toBe(1);
    await expect(p2).resolves.toBe(2);
    await expect(p3).resolves.toBe(3);

    expect(finished).toEqual([1, 2, 3]);
  });

  it('rejects pending and active tasks when cancelled', async () => {
    const queue = new TaskQueue(1);
    const error = new Error('stop');

    const active = queue.push<string>(signal => {
      return new Promise((_, reject) => {
        const abortHandler = (): void => {
          signal.removeEventListener('abort', abortHandler);
          reject(signal.reason ?? error);
        };
        signal.addEventListener('abort', abortHandler);
      });
    });

    const pending = queue.push(() => Promise.resolve('later'));

    queue.cancelAll(error);

    await expect(active).rejects.toMatchObject({ message: 'stop' });
    await expect(pending).rejects.toMatchObject({ message: 'stop' });
    expect(queue.activeSize).toBe(0);
    expect(queue.pendingSize).toBe(0);
  });

  it('throws when constructed with invalid concurrency', () => {
    expect(() => new TaskQueue(0)).toThrow(
      'TaskQueue requires maxConcurrency >= 1'
    );
  });
});
