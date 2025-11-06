# @magsag/specialist

SAG delegation and specialization logic for the MAGSAG framework.

## Overview

`@magsag/specialist` provides specialized agent (SAG) delegation logic, enabling intelligent routing of tasks to the most appropriate SAG based on task characteristics, context, and availability.

## Features

- Intelligent SAG selection
- Task classification and routing
- Specialization domain matching
- Load balancing across SAGs
- Fallback strategies
- Performance tracking

## Usage

```typescript
import { SpecialistRouter } from '@magsag/specialist';

const router = new SpecialistRouter({
  specialists: [
    {
      id: 'code-refactor-sag',
      domains: ['refactoring', 'code-quality'],
      languages: ['typescript', 'javascript'],
      availability: 0.8,
    },
    {
      id: 'test-gen-sag',
      domains: ['testing', 'test-generation'],
      languages: ['typescript'],
      availability: 1.0,
    },
  ],
});

// Route a task to the best specialist
const specialist = router.route({
  instruction: 'Refactor authentication module',
  context: {
    language: 'typescript',
    domain: 'refactoring',
  },
});

console.log(specialist.id); // 'code-refactor-sag'
```

## Specialist Definition

```typescript
interface Specialist {
  id: string;
  name?: string;
  domains: string[];
  languages?: string[];
  availability: number; // 0.0 - 1.0
  maxConcurrency?: number;
  priority?: number;
  metadata?: Record<string, unknown>;
}
```

## Routing Strategies

### Domain-Based Routing

Routes based on task domain:

```typescript
const router = new SpecialistRouter({
  strategy: 'domain',
  specialists: [
    { id: 'sag-1', domains: ['backend', 'api'] },
    { id: 'sag-2', domains: ['frontend', 'ui'] },
  ],
});

// Routes to 'sag-2'
const specialist = router.route({
  instruction: 'Improve UI responsiveness',
  context: { domain: 'frontend' },
});
```

### Language-Based Routing

Routes based on programming language:

```typescript
const router = new SpecialistRouter({
  strategy: 'language',
  specialists: [
    { id: 'ts-sag', domains: [], languages: ['typescript'] },
    { id: 'py-sag', domains: [], languages: ['python'] },
  ],
});

// Routes to 'py-sag'
const specialist = router.route({
  instruction: 'Optimize data processing',
  context: { language: 'python' },
});
```

### Load-Balanced Routing

Distributes tasks based on current load:

```typescript
const router = new SpecialistRouter({
  strategy: 'load-balanced',
  specialists: [
    { id: 'sag-1', domains: ['general'], availability: 1.0 },
    { id: 'sag-2', domains: ['general'], availability: 0.3 },
  ],
});

// Routes to 'sag-1' (higher availability)
const specialist = router.route({
  instruction: 'Implement feature',
});
```

### Priority-Based Routing

Routes based on specialist priority:

```typescript
const router = new SpecialistRouter({
  strategy: 'priority',
  specialists: [
    { id: 'premium-sag', domains: [], priority: 10 },
    { id: 'standard-sag', domains: [], priority: 5 },
  ],
});
```

## Fallback Strategies

Handle routing failures gracefully:

```typescript
const router = new SpecialistRouter({
  specialists: [...],
  fallback: {
    strategy: 'round-robin',
    defaultSpecialist: 'general-sag',
  },
});

// If no specialist matches, uses fallback
const specialist = router.route({
  instruction: 'Unknown task',
  context: { domain: 'unknown' },
});
```

## Concurrency Management

Track and limit concurrent tasks per specialist:

```typescript
const router = new SpecialistRouter({
  specialists: [
    {
      id: 'sag-1',
      domains: ['general'],
      maxConcurrency: 2,
    },
  ],
});

// Acquire specialist
const specialist = router.acquire('sag-1');

// Execute task
await executeTask(specialist);

// Release specialist
router.release('sag-1');
```

## Integration with Manager

Works with the manager package for parallel execution:

```typescript
import { SpecialistRouter } from '@magsag/specialist';
import { ParallelExecutor } from '@magsag/manager';

const router = new SpecialistRouter({ specialists: [...] });

const executor = new ParallelExecutor({
  specialistRouter: router,
  concurrency: 4,
});

await executor.execute(tasks);
```

## Task Classification

Automatically classify tasks:

```typescript
import { TaskClassifier } from '@magsag/specialist';

const classifier = new TaskClassifier();

const classification = classifier.classify({
  instruction: 'Write unit tests for authentication',
});

console.log(classification);
// {
//   domain: 'testing',
//   subDomain: 'unit-tests',
//   language: 'inferred-from-context',
//   complexity: 'medium',
// }
```

## Performance Tracking

Track specialist performance:

```typescript
const router = new SpecialistRouter({
  specialists: [...],
  tracking: {
    enabled: true,
    windowSize: 100, // Last 100 tasks
  },
});

// After executions
const stats = router.getStats('sag-1');
console.log(stats);
// {
//   tasksCompleted: 150,
//   successRate: 0.95,
//   avgDuration: 45000,
//   availability: 0.8,
// }
```

## Dynamic Specialist Registration

Add/remove specialists at runtime:

```typescript
const router = new SpecialistRouter();

// Add specialist
router.registerSpecialist({
  id: 'new-sag',
  domains: ['database'],
  availability: 1.0,
});

// Remove specialist
router.unregisterSpecialist('old-sag');

// Update specialist
router.updateSpecialist('sag-1', {
  availability: 0.5,
});
```

## CLI Integration

Specialist routing is integrated into the CLI execution:

```bash
pnpm --filter @magsag/cli exec magsag agent exec \
  --plan plan.json \
  --specialist-config specialists.json
```

## Configuration File

Define specialists in JSON:

```json
{
  "specialists": [
    {
      "id": "code-refactor-sag",
      "domains": ["refactoring", "code-quality"],
      "languages": ["typescript", "javascript"],
      "availability": 0.8,
      "maxConcurrency": 2
    },
    {
      "id": "test-gen-sag",
      "domains": ["testing"],
      "languages": ["typescript"],
      "availability": 1.0,
      "maxConcurrency": 3
    }
  ],
  "strategy": "domain",
  "fallback": {
    "strategy": "round-robin",
    "defaultSpecialist": "general-sag"
  }
}
```

## Development

```bash
# Run tests
pnpm --filter @magsag/specialist test

# Type checking
pnpm --filter @magsag/specialist typecheck

# Linting
pnpm --filter @magsag/specialist lint

# Build
pnpm --filter @magsag/specialist build
```

## Performance

- Routing decision: <5ms
- Classification: <10ms
- Memory per specialist: ~1KB

## Dependencies

- `@magsag/core` - Core types

## License

Apache-2.0
