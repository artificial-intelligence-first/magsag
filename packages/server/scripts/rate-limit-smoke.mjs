#!/usr/bin/env node
import { InMemoryRunnerRegistry } from '@magsag/core';
import { createAgentApp } from '../dist/index.js';

const logResponse = async (label, response) => {
  const body = await response.clone().json().catch(async () => response.clone().text());
  console.log(`\n[${label}] status=${response.status}`);
  console.log('headers:', {
    'access-control-allow-origin': response.headers.get('access-control-allow-origin'),
    'x-ratelimit-limit': response.headers.get('x-ratelimit-limit'),
    'x-ratelimit-remaining': response.headers.get('x-ratelimit-remaining'),
    'retry-after': response.headers.get('retry-after')
  });
  if (body) {
    console.log('body:', body);
  }
};

const main = async () => {
  const registry = new InMemoryRunnerRegistry();
  registry.register({
    id: 'codex-cli',
    create() {
      return {
        async *run() {
          yield { type: 'log', data: 'demo' };
          yield { type: 'done' };
        }
      };
    }
  });

  const app = createAgentApp({
    registry,
    security: {
      cors: {
        allowedOrigins: ['https://app.example.com']
      },
      rateLimit: {
        enabled: true,
        requestsPerSecond: 1,
        burst: 1
      }
    }
  });

  const spec = JSON.stringify({
    engine: 'codex-cli',
    repo: '/tmp/repo',
    prompt: 'smoke test'
  });

  const first = await app.request('/api/v1/agent/run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.example.com',
      'x-forwarded-for': '198.51.100.1'
    },
    body: spec
  });

  const second = await app.request('/api/v1/agent/run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://malicious.example.com',
      'x-forwarded-for': '198.51.100.2'
    },
    body: spec
  });

  const third = await app.request('/api/v1/agent/run', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://app.example.com',
      'x-forwarded-for': '198.51.100.1'
    },
    body: spec
  });

  await logResponse('trusted request', first);
  await logResponse('blocked CORS', second);
  await logResponse('rate limited', third);
};

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
