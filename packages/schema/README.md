# @magsag/schema

Shared Zod schemas for the MAGSAG framework.

## Overview

`@magsag/schema` provides centralized type-safe schema definitions using [Zod](https://zod.dev/). These schemas ensure data validation and type consistency across the entire MAGSAG stack.

## Key Schemas

### RunSpec

Defines the specification for agent execution runs:

```typescript
import { RunSpecSchema } from '@magsag/schema';

const runSpec = RunSpecSchema.parse({
  id: 'run-123',
  taskId: 'task-456',
  instruction: 'Implement feature X',
  engine: 'mag',
  worktreePath: '/tmp/worktrees/task-456',
  timeout: 300000,
  env: { NODE_ENV: 'development' },
});
```

### RunnerEvent

Defines events emitted during agent execution:

```typescript
import { RunnerEventSchema } from '@magsag/schema';

const event = RunnerEventSchema.parse({
  type: 'progress',
  timestamp: new Date().toISOString(),
  runId: 'run-123',
  data: {
    progress: 0.5,
    message: 'Processing...',
  },
});
```

### PolicyDefinition

Defines governance policy structures:

```typescript
import { PolicyDefinitionSchema } from '@magsag/schema';

const policy = PolicyDefinitionSchema.parse({
  id: 'require-tests',
  name: 'Require Test Execution',
  type: 'required_action',
  rules: [
    { test_executed: true },
    { min_coverage: 80 },
  ],
  severity: 'error',
  message: 'All workflows must execute tests',
});
```

### WorktreeState

Defines worktree metadata and state:

```typescript
import { WorktreeStateSchema } from '@magsag/schema';

const state = WorktreeStateSchema.parse({
  id: 'wt-abc123',
  path: '/tmp/worktrees/feature-123',
  branch: 'feature-123',
  baseBranch: 'main',
  createdAt: '2025-11-06T08:00:00Z',
  status: 'active',
});
```

### FlowSummary

Defines agent workflow execution summaries:

```typescript
import { FlowSummarySchema } from '@magsag/schema';

const summary = FlowSummarySchema.parse({
  flowId: 'flow-123',
  startTime: '2025-11-06T08:00:00Z',
  endTime: '2025-11-06T08:15:00Z',
  status: 'completed',
  tasks: [
    { id: 'task-1', status: 'success' },
    { id: 'task-2', status: 'success' },
  ],
  metrics: {
    totalDuration: 900000,
    taskCount: 2,
    successRate: 1.0,
  },
});
```

## Usage

### Parsing and Validation

```typescript
import { RunSpecSchema } from '@magsag/schema';

// Parse and validate
try {
  const runSpec = RunSpecSchema.parse(data);
  // TypeScript knows the exact shape of runSpec
  console.log(runSpec.instruction);
} catch (error) {
  console.error('Validation failed:', error);
}
```

### Safe Parsing

```typescript
import { RunSpecSchema } from '@magsag/schema';

// Safe parse returns { success: boolean, data?: T, error?: ZodError }
const result = RunSpecSchema.safeParse(data);

if (result.success) {
  console.log('Valid:', result.data);
} else {
  console.error('Invalid:', result.error.issues);
}
```

### Type Inference

```typescript
import { RunSpecSchema } from '@magsag/schema';
import type { z } from 'zod';

// Infer TypeScript type from schema
type RunSpec = z.infer<typeof RunSpecSchema>;

const processRun = (spec: RunSpec) => {
  // TypeScript provides full type checking
};
```

### Schema Composition

```typescript
import { z } from 'zod';
import { RunSpecSchema } from '@magsag/schema';

// Extend existing schemas
const ExtendedRunSpecSchema = RunSpecSchema.extend({
  customField: z.string().optional(),
  metadata: z.record(z.unknown()),
});
```

## Available Schemas

### Core Schemas
- `RunSpecSchema` - Agent execution specification
- `RunnerEventSchema` - Execution event types
- `EngineConfigSchema` - Engine configuration

### Governance Schemas
- `PolicyDefinitionSchema` - Policy definitions
- `FlowSummarySchema` - Workflow summaries
- `PolicyViolationSchema` - Policy violations

### Worktree Schemas
- `WorktreeStateSchema` - Worktree metadata
- `WorktreeConfigSchema` - Worktree configuration

### MCP Schemas
- `MCPServerConfigSchema` - MCP server configuration
- `MCPToolSchema` - MCP tool definitions
- `MCPResourceSchema` - MCP resource definitions

### Manager Schemas
- `TaskSpecSchema` - Task specifications
- `ExecutionPlanSchema` - Execution plans
- `MetricsSchema` - Execution metrics

## Type Safety

All schemas provide compile-time type safety through Zod's type inference:

```typescript
// ✅ Type-safe
const spec: z.infer<typeof RunSpecSchema> = {
  id: 'run-123',
  taskId: 'task-456',
  instruction: 'Test',
  engine: 'mag',
};

// ❌ TypeScript error: missing required fields
const invalid: z.infer<typeof RunSpecSchema> = {
  id: 'run-123',
};
```

## Validation Errors

Zod provides detailed validation errors:

```typescript
const result = RunSpecSchema.safeParse(invalidData);

if (!result.success) {
  result.error.issues.forEach(issue => {
    console.error(`${issue.path.join('.')}: ${issue.message}`);
  });
}
```

## Performance

Zod schemas are optimized for:
- Fast validation (~microseconds for typical payloads)
- Minimal memory overhead
- Efficient error reporting

## Development

```bash
# Run tests
pnpm --filter @magsag/schema test

# Type checking
pnpm --filter @magsag/schema typecheck

# Linting
pnpm --filter @magsag/schema lint

# Build
pnpm --filter @magsag/schema build
```

## Dependencies

- `zod` - Schema validation library

## License

Apache-2.0
