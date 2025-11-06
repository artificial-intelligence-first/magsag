# @magsag/demo-shared

Shared utilities for demo CLI and API applications.

## Overview

`@magsag/demo-shared` provides shared utilities, helpers, and types used by both the demo CLI and demo API applications. It centralizes common functionality to avoid code duplication.

## Features

- MCP preset loading and management
- ExecPlan summary generation
- Shared configuration utilities
- Common type definitions
- Helper functions

## MCP Presets

Load MCP server presets:

```typescript
import { loadMCPPresets } from '@magsag/demo-shared';

const presets = await loadMCPPresets({
  presetsRoot: './tools/adk/servers',
});

console.log(presets);
// [
//   {
//     id: 'filesystem',
//     name: 'Filesystem',
//     transport: 'stdio',
//     command: 'npx',
//     args: ['-y', '@modelcontextprotocol/server-filesystem', '/path'],
//   },
//   ...
// ]
```

## ExecPlan Summaries

Generate execution plan summaries:

```typescript
import { summarizeExecPlan } from '@magsag/demo-shared';

const summary = await summarizeExecPlan({
  planPath: './docs/development/plans/repo-cleanup-execplan.md',
});

console.log(summary);
// {
//   title: 'Repository Cleanup',
//   status: 'in-progress',
//   completedTasks: 15,
//   totalTasks: 25,
//   progress: 0.6,
//   lastUpdated: '2025-11-06T08:00:00Z',
// }
```

## Configuration Utilities

```typescript
import { loadConfig, validateConfig } from '@magsag/demo-shared';

// Load configuration
const config = await loadConfig({
  configPath: './config.json',
  defaults: {
    port: 3000,
    host: 'localhost',
  },
});

// Validate configuration
const result = validateConfig(config, schema);
if (!result.valid) {
  console.error('Config errors:', result.errors);
}
```

## Type Definitions

Shared types used across demos:

```typescript
import type {
  MCPPreset,
  ExecPlanSummary,
  DemoConfig,
} from '@magsag/demo-shared';

const preset: MCPPreset = {
  id: 'github',
  name: 'GitHub MCP',
  transport: 'http',
  endpoint: 'http://localhost:3000',
};

const summary: ExecPlanSummary = {
  title: 'Migration Plan',
  status: 'in-progress',
  completedTasks: 10,
  totalTasks: 20,
  progress: 0.5,
};
```

## Helper Functions

### formatDuration

```typescript
import { formatDuration } from '@magsag/demo-shared';

const formatted = formatDuration(125000); // 125 seconds
console.log(formatted); // "2m 5s"
```

### formatBytes

```typescript
import { formatBytes } from '@magsag/demo-shared';

const formatted = formatBytes(1536); // 1536 bytes
console.log(formatted); // "1.5 KB"
```

### parseMarkdownPlan

```typescript
import { parseMarkdownPlan } from '@magsag/demo-shared';

const plan = await parseMarkdownPlan({
  planPath: './plan.md',
});

console.log(plan);
// {
//   sections: [...],
//   tasks: [...],
//   metadata: {...},
// }
```

## MCP Preset Format

```typescript
interface MCPPreset {
  id: string;
  name: string;
  description?: string;
  transport: 'http' | 'sse' | 'stdio';
  command?: string;
  args?: string[];
  endpoint?: string;
  env?: Record<string, string>;
}
```

## ExecPlan Summary Format

```typescript
interface ExecPlanSummary {
  title: string;
  status: 'not-started' | 'in-progress' | 'completed' | 'blocked';
  completedTasks: number;
  totalTasks: number;
  progress: number; // 0.0 - 1.0
  lastUpdated: string;
  workstreams?: WorkstreamSummary[];
}
```

## Usage in Demo CLI

```typescript
import { loadMCPPresets, summarizeExecPlan } from '@magsag/demo-shared';

// In demo CLI
const presets = await loadMCPPresets({ presetsRoot: './tools/adk/servers' });
console.table(presets);

const summary = await summarizeExecPlan({ planPath: './plan.md' });
console.log(summary);
```

## Usage in Demo API

```typescript
import { loadMCPPresets, summarizeExecPlan } from '@magsag/demo-shared';
import express from 'express';

const app = express();

app.get('/mcp', async (req, res) => {
  const presets = await loadMCPPresets({ presetsRoot: './tools/adk/servers' });
  res.json({ presets });
});

app.get('/plan', async (req, res) => {
  const summary = await summarizeExecPlan({ planPath: './plan.md' });
  res.json({ summary });
});
```

## Caching

Utilities support caching:

```typescript
import { loadMCPPresets } from '@magsag/demo-shared';

const presets = await loadMCPPresets({
  presetsRoot: './tools/adk/servers',
  cache: true,
  cacheTTL: 300000, // 5 minutes
});
```

## Development

```bash
# Run tests
pnpm --filter @magsag/demo-shared test

# Type checking
pnpm --filter @magsag/demo-shared typecheck

# Linting
pnpm --filter @magsag/demo-shared lint

# Build
pnpm --filter @magsag/demo-shared build
```

## Performance

- MCP preset loading: ~50ms
- ExecPlan parsing: ~100ms
- Memory per preset: ~1KB

## Dependencies

- `yaml` - YAML parsing
- `@magsag/shared-logging` - Logging

## License

Apache-2.0
