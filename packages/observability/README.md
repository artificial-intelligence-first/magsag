# @magsag/observability

Flow summaries, metrics orchestration, and observability for the MAGSAG framework.

## Overview

`@magsag/observability` provides comprehensive monitoring, logging, and metrics collection for agent workflow executions. It generates flow summaries, tracks performance metrics, and enables distributed tracing integration.

## Key Components

### FlowSummary Generator

Creates comprehensive summaries of workflow executions:

```typescript
import { FlowSummaryGenerator } from '@magsag/observability';

const generator = new FlowSummaryGenerator();

const summary = await generator.generate({
  flowId: 'flow-123',
  events: executionEvents,
  startTime: startTimestamp,
  endTime: endTimestamp,
});

console.log(summary);
// {
//   flowId: 'flow-123',
//   duration: 15000,
//   taskCount: 5,
//   successRate: 0.8,
//   tasks: [...],
//   metrics: {...}
// }
```

### Metrics Collector

Collects and aggregates execution metrics:

```typescript
import { MetricsCollector } from '@magsag/observability';

const collector = new MetricsCollector();

// Record metrics
collector.record('task.duration', 5000, { taskId: 'task-1' });
collector.record('task.success', 1, { taskId: 'task-1' });
collector.record('task.failure', 0, { taskId: 'task-1' });

// Get aggregated metrics
const metrics = collector.aggregate();
console.log(metrics);
// {
//   'task.duration': { sum: 5000, count: 1, avg: 5000, max: 5000, min: 5000 },
//   'task.success': { sum: 1, count: 1 },
//   'task.failure': { sum: 0, count: 1 }
// }
```

### Event Stream Logger

Logs execution events to JSONL format:

```typescript
import { EventStreamLogger } from '@magsag/observability';

const logger = new EventStreamLogger({
  outputPath: '.magsag/runs/run-123.jsonl',
});

// Log events
logger.log({
  type: 'task.start',
  timestamp: new Date().toISOString(),
  taskId: 'task-1',
  data: { instruction: 'Implement feature' },
});

logger.log({
  type: 'task.complete',
  timestamp: new Date().toISOString(),
  taskId: 'task-1',
  data: { status: 'success', duration: 5000 },
});

await logger.close();
```

### Distributed Tracing

Integration with OpenTelemetry for distributed tracing:

```typescript
import { TracingProvider } from '@magsag/observability';

const tracing = new TracingProvider({
  serviceName: 'magsag-agent',
  otlpEndpoint: process.env.MAGSAG_OTLP_ENDPOINT,
  enabled: process.env.MAGSAG_OTEL_TRACING_ENABLED === 'true',
});

// Create spans
const span = tracing.startSpan('task.execution', {
  attributes: {
    'task.id': 'task-1',
    'task.engine': 'mag',
  },
});

try {
  await executeTask();
  span.setStatus({ code: 'OK' });
} catch (error) {
  span.setStatus({ code: 'ERROR', message: error.message });
  throw error;
} finally {
  span.end();
}
```

## Features

### Flow Summaries

Comprehensive workflow execution summaries include:
- Total execution duration
- Task breakdown and status
- Success/failure rates
- Resource utilization
- Error details

### Performance Metrics

Tracked metrics:
- Task execution duration
- Concurrency levels
- Resource usage (CPU, memory)
- Queue depths
- Throughput rates

### JSONL Logging

Events are logged in JSON Lines format for easy parsing:

```jsonl
{"type":"flow.start","timestamp":"2025-11-06T08:00:00Z","flowId":"flow-123"}
{"type":"task.start","timestamp":"2025-11-06T08:00:01Z","taskId":"task-1"}
{"type":"task.complete","timestamp":"2025-11-06T08:00:06Z","taskId":"task-1","duration":5000}
{"type":"flow.complete","timestamp":"2025-11-06T08:15:00Z","flowId":"flow-123"}
```

### Replay Capability

Flow executions can be replayed from JSONL logs:

```bash
pnpm --filter @magsag/cli exec magsag runs describe run-123
```

## Integration

### CLI Integration

Observability is automatically enabled during CLI execution:

```bash
pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
# Logs written to .magsag/runs/<id>.jsonl
```

### OpenTelemetry Integration

Enable distributed tracing:

```bash
export MAGSAG_OTEL_TRACING_ENABLED=true
export MAGSAG_OTLP_ENDPOINT=http://localhost:4318

pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
```

Traces are exported to your configured OTLP collector (Jaeger, Zipkin, etc.).

## Environment Variables

- `MAGSAG_OTEL_TRACING_ENABLED` - Enable OpenTelemetry tracing (default: `false`)
- `MAGSAG_OTLP_ENDPOINT` - OTLP collector endpoint
- `MAGSAG_METRICS_ENABLED` - Enable metrics collection (default: `true`)
- `MAGSAG_LOG_LEVEL` - Logging level (`debug|info|warn|error`)

## Output Locations

- Execution logs: `.magsag/runs/<run-id>.jsonl`
- Flow summaries: `.magsag/summaries/<flow-id>.json`
- Metrics: Exported to configured backends

## Development

```bash
# Run tests
pnpm --filter @magsag/observability test

# Type checking
pnpm --filter @magsag/observability typecheck

# Linting
pnpm --filter @magsag/observability lint

# Build
pnpm --filter @magsag/observability build
```

## Performance

- Event logging: ~1ms per event
- Metrics aggregation: O(1) for recording, O(n) for aggregation
- Tracing overhead: ~100μs per span

## Dependencies

- `@opentelemetry/api` - Tracing API (optional)
- `@magsag/shared-logging` - Logging utilities

## License

Apache-2.0
