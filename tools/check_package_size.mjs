#!/usr/bin/env node
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const kib = (value) => value * 1024;

const targets = [
  {
    name: '@magsag/shared-logging',
    path: 'packages/shared-logging/dist',
    maxBytes: kib(32)
  },
  {
    name: '@magsag/core',
    path: 'packages/core/dist',
    maxBytes: kib(48)
  },
  {
    name: '@magsag/server',
    path: 'packages/server/dist',
    maxBytes: kib(96)
  },
  {
    name: '@magsag/cli',
    path: 'packages/cli/dist',
    maxBytes: kib(160)
  },
  {
    name: '@magsag/mcp-client',
    path: 'packages/mcp-client/dist',
    maxBytes: kib(1024)
  },
  {
    name: '@magsag/mcp-server',
    path: 'packages/mcp-server/dist',
    maxBytes: kib(160)
  },
  {
    name: '@magsag/observability',
    path: 'packages/observability/dist',
    maxBytes: kib(192)
  },
  {
    name: '@magsag/governance',
    path: 'packages/governance/dist',
    maxBytes: kib(160)
  },
  {
    name: '@magsag/catalog-mcp',
    path: 'packages/catalog-mcp/dist',
    maxBytes: kib(96)
  }
];

const formatBytes = (bytes) => `${(bytes / 1024).toFixed(2)} KiB`;

const main = async () => {
  const results = [];
  for (const target of targets) {
    const fullPath = join(process.cwd(), target.path);
    let total = 0;
    try {
      const entries = await readdir(fullPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        const file = join(fullPath, entry.name);
        const { size } = await stat(file);
        total += size;
      }
    } catch (error) {
      console.error(`❌ Missing build artifacts for ${target.name} under ${target.path}`);
      throw error;
    }
    const withinBudget = total <= target.maxBytes;
    results.push({ target, total, withinBudget });
    const status = withinBudget ? '✅' : '❌';
    console.log(`${status} ${target.name} bundle size ${formatBytes(total)} (budget ${formatBytes(target.maxBytes)})`);
    if (!withinBudget) {
      throw new Error(`${target.name} exceeds size budget (${total} bytes > ${target.maxBytes} bytes)`);
    }
  }
  if (results.length === 0) {
    console.warn('No package size targets defined.');
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
