---
title: A2A MAG Route Template
slug: agent-template-mag-a2a-route
status: living
last_updated: '2025-11-01'
last_synced: '2025-11-01'
tags:
- catalog
- agent
- template
- routing
- a2a
summary: Template for documenting routing flows of A2A-enabled main agents.
description: Template for documenting routing flows of A2A-enabled main agents.
authors: []
sources: []
---

# Routing Logic - YourA2AOrchestratorMAG

> **For Humans**: Use this template to describe A2A routing phases, logging, and fallbacks.
>
> **For AI Agents**: Keep protocol metadata, event names, and fallbacks aligned with implementation.

## A2A Communication Flow

```
External Agent/Client
    │
    ├─→ Discovery Phase
    │   └─→ GET /api/v1/agents
    │       └─→ Returns: [{slug, title, description}]
    │
    └─→ Invocation Phase
        └─→ POST /api/v1/agents/your-a2a-orchestrator-mag/run
            │
            ├─→ Phase 1: Request Validation
            │       └─→ Validate input schema
            │
            ├─→ Phase 2: Task Decomposition
            │       ├─ IF skill.task-decomposition available:
            │       │    └─→ Invoke skill → tasks[]
            │       └─ ELSE:
            │            └─→ Fallback: [default-sag]
            │
            ├─→ Phase 3: A2A Delegation
            │       └─ FOR EACH task:
            │            ├─→ Log a2a_invoke_start
            │            ├─→ Create Delegation(task_id, sag_id, input, context)
            │            ├─→ runner.invoke_sag(delegation) → Result
            │            ├─ IF status == "success":
            │            │    └─→ Collect result, log a2a_invoke_complete
            │            └─ ELSE:
            │                 └─→ Log a2a_invoke_failure, continue
            │
            ├─→ Phase 4: Result Aggregation
            │       ├─ IF skill.result-aggregation available:
            │       │    └─→ Invoke skill(results) → aggregated
            │       └─ ELSE:
            │            └─→ Fallback: Use first successful result
            │
            └─→ Phase 5: Response Formatting
                    └─→ Package with metadata and A2A trace
                        ├─ result: aggregated output
                        ├─ metadata: run stats
                        └─ trace: A2A call details
```

## SAG Selection Rules

### Current (v0.1.0)
- **Default:** Route to `your-a2a-advisor-sag`
- **Reason:** Initial A2A implementation

### Future Enhancements

#### Dynamic Agent Discovery
```ts
// Discover available agents via the registry
const availableAgents = await registry.discoverAgents({ capability: 'data-processing' });
// Select the best agent based on your criteria
const selectedAgent = selectBestAgent(availableAgents, criteria);
```

#### Load-Based Routing
```ts
// Route to the least loaded agent instance
const target = agentLoad[sag1] < agentLoad[sag2] ? sag1 : sag2;
```

#### Capability-Based Routing
```ts
// Route based on required capabilities
let target = 'batch-sag';
if (task.requirements.includes('real-time-processing')) {
  target = 'real-time-sag';
}
```

## A2A-Specific Error Handling

### Communication Failures

```ts
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

try {
  const result = await runtime.delegate?.(delegation);
  return result;
} catch (error) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    await sleep(2 ** attempt * 100);
    try {
      return await runtime.delegate?.(delegation);
    } catch (retryError) {
      if (attempt === maxRetries - 1) {
        throw retryError;
      }
    }
  }
  throw error;
}
```

### Timeout Handling

```ts
// Set timeout for A2A calls (seconds)
delegation.timeoutSeconds = 10;

try {
  const result = await runtime.delegate?.(delegation);
  return result;
} catch (error) {
  runtime.log?.('a2a_timeout', { agent: sagId, timeoutSeconds: 10 });
  // Fallback to alternative agent or return partial results
}
```

### Circuit Breaker Pattern

```ts
// Track failure rate and open a circuit when thresholds are exceeded
if (failureRate[sagId] > 0.5) {
  runtime.log?.('circuit_breaker_open', { agent: sagId });
  const fallback = getFallbackAgent(sagId);
  await runtime.delegate?.({ target: fallback, input: payload });
}
```

## Context Propagation

### Standard Context
Every A2A delegation includes:
```ts
const context = {
  parentRunId: runId,
  taskIndex: idx,
  totalTasks: tasks.length
};
```

### A2A-Specific Context
```ts
const a2aContext = {
  correlationId,
  sourceAgent: 'your-a2a-orchestrator-mag',
  callChain: ['external-client', 'your-a2a-orchestrator-mag', 'your-a2a-advisor-sag'],
  traceId
};
```

## Observability

### Standard Events
```jsonl
{"event":"start","agent":"YourA2AOrchestratorMAG"}
{"event":"decomposition","task_count":2}
{"event":"delegation_start","task_id":"task-1","sag_id":"your-a2a-advisor-sag"}
{"event":"delegation_complete","task_id":"task-1","status":"success"}
{"event":"aggregation","result_count":2}
{"event":"end","status":"success","duration_ms":350}
```

### A2A-Specific Events
```jsonl
{"event":"a2a_discovery","agent":"your-a2a-advisor-sag","discovered":true,"capabilities":["data-processing"]}
{"event":"a2a_invoke_start","target":"your-a2a-advisor-sag","task_id":"task-1","correlation_id":"abc-123"}
{"event":"a2a_invoke_complete","target":"your-a2a-advisor-sag","status":"success","duration_ms":150}
{"event":"a2a_invoke_failure","target":"your-a2a-advisor-sag","error":"Connection timeout","retry_attempt":1}
{"event":"a2a_circuit_breaker","agent":"failing-sag","status":"open","failure_rate":0.75}
```

### Metrics
```json
{
  "latency_ms": [{"value": 350}],
  "task_count": [{"value": 2}],
  "success_count": [{"value": 2}],
  "a2a_calls": [{"value": 3}],
  "a2a_success_rate": [{"value": 1.0}],
  "a2a_avg_latency_ms": [{"value": 120}]
}
```

## Security Considerations

### Input Validation
- Validate all incoming A2A requests against schema
- Sanitize user-provided data
- Reject malformed requests early

### Authentication (Future)
```ts
// Verify calling agent identity
const verifyAgentToken = (token: string | undefined): boolean => {
  // Validate JWT or API key
  return Boolean(token && isValidToken(token));
};

// In orchestrator
if (!verifyAgentToken(request.headers.get('authorization'))) {
  throw new Error('Invalid agent credentials');
}
```

### Rate Limiting (Future)
```ts
// Limit requests per agent
if (requestCount[sourceAgent] > rateLimit) {
  throw new Error(`Agent ${sourceAgent} exceeded rate limit`);
}
```

## Testing Strategies

### Unit Tests
- Test task decomposition logic
- Test result aggregation with various input combinations
- Test error handling for individual failures

### Integration Tests
- Test discovery endpoint response
- Test invocation endpoint with valid/invalid payloads
- Test A2A delegation to SAGs

### E2E Tests
- Test full discovery → invoke → aggregate → response flow
- Test multi-agent coordination scenarios
- Test failure recovery and partial result handling

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance to the A2A MAG route template.
