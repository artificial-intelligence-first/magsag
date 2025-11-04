import { describe, expect, it } from 'vitest';

import {
  RUNNER_MCP_ENV,
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
      [RUNNER_MCP_ENV.tools]: 'one,two'
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
    process.env[RUNNER_MCP_ENV.url] = 'http://previous';
    delete process.env[RUNNER_MCP_ENV.tools];

    const restore = applyRunnerMcpEnv(sampleMetadata());
    expect(process.env[RUNNER_MCP_ENV.url]).toBe('http://127.0.0.1:4000/mcp');
    expect(process.env[RUNNER_MCP_ENV.tools]).toBe('one,two');

    restore();

    expect(process.env[RUNNER_MCP_ENV.url]).toBe('http://previous');
    expect(process.env[RUNNER_MCP_ENV.tools]).toBeUndefined();

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
  });
});
