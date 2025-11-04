---
title: A2A SAG Template Overview
slug: agent-template-sag-a2a
status: living
last_updated: '2025-11-01'
last_synced: '2025-11-01'
tags:
- catalog
- agent
- template
- sag
- a2a
summary: Template for documenting A2A-capable sub-agents.
description: Template for documenting A2A-capable sub-agents.
authors: []
sources: []
---

# YourA2AAdvisorSAG

> **For Humans**: Use this template when documenting A2A-enabled sub-agents.
>
> **For AI Agents**: Populate every section with concrete A2A behaviours, contracts, and logging requirements.

**Role:** Sub-Agent (SAG) with A2A Support
**Version:** 0.1.0
**Status:** Template

## Overview

This is an A2A-enabled (Agent-to-Agent) specialist template that supports:
- **Discovery:** Can be discovered by other agents via API
- **Invocation:** Can be invoked by MAGs via runner or API
- **Context Propagation:** Preserves A2A tracing context
- **Specialized Processing:** Executes domain-specific tasks

## A2A Capabilities

### Discovery
This agent can be discovered via the agent registry:
```bash
curl http://localhost:8000/api/v1/agents
```

Response includes:
```json
{
  "slug": "your-a2a-advisor-sag",
  "title": "YourA2AAdvisorSAG",
  "description": "A2A-enabled Sub-Agent for specialized task execution"
}
```

### Invocation
This agent is typically invoked by MAGs via the runner interface, but can also be called via API if needed:

#### Via Runner (Standard)
```ts
const delegation = {
  taskId: 'task-1',
  sagId: 'your-a2a-advisor-sag',
  input: taskInput,
  context: {
    parentRunId: 'mag-abc123',
    correlationId: 'xyz-789'
  }
};
const result = await runtime.delegate?.(delegation);
```

#### Via API (Advanced)
```bash
curl -X POST http://localhost:8000/api/v1/agents/your-a2a-advisor-sag/run \
  -H "Content-Type: application/json" \
  -d '{"domain_field": "value", "context": {"correlation_id": "xyz-789"}}'
```

## Responsibilities

- Execute domain-specific logic
- Preserve A2A context for tracing
- Return structured output conforming to contract
- Handle errors gracefully with meaningful messages

## Input Contract

**Schema:** `contracts/a2a_advisor_input.schema.json`

Example:
```json
{
  "domain_field": "value",
  "parameters": {
    "param1": 123,
    "param2": "option_a"
  },
  "context": {
    "parent_run_id": "mag-abc123",
    "correlation_id": "xyz-789",
    "source_agent": "your-a2a-orchestrator-mag",
    "call_chain": ["external-client", "your-a2a-orchestrator-mag"]
  }
}
```

## Output Contract

**Schema:** `contracts/a2a_advisor_output.schema.json`

Example:
```json
{
  "result": {
    "processed_field": "processed_value",
    "details": {
      "metric1": 42,
      "metric2": "status_ok"
    }
  },
  "confidence": 0.95,
  "notes": "Processed successfully",
  "trace": {
    "correlation_id": "xyz-789",
    "processing_time_ms": 150,
    "call_depth": 2
  }
}
```

## Dependencies

### Skills
- `skill.your-domain-skill` - Domain-specific processing skill

## Execution Logic

1. **Input Extraction** - Extract data and A2A context
2. **Context Validation** - Verify A2A tracing context
3. **Domain Processing** - Apply specialized logic
4. **Skill Invocation** - Call required skills
5. **Output Formatting** - Package results with A2A trace

## A2A Context Handling

### Context Extraction
```ts
// Extract A2A context from payload
const a2aContext = payload.context ?? {};
const { correlationId, parentRunId } = a2aContext;
const callChain = Array.isArray(a2aContext.callChain) ? a2aContext.callChain : [];
```

### Context Propagation
```ts
// Preserve context in output
const outputTrace = {
  correlationId,
  processingTimeMs: durationMs,
  callDepth: callChain.length,
  parentRunId
};
```

## Error Handling

- **Invalid Input:** Return error with validation details
- **Skill Failure:** Log error and return partial/default result
- **Context Missing:** Log warning, continue with degraded tracing
- **Unexpected Exception:** Propagate with A2A diagnostic context

## Observability

Executions produce metrics:
- `latency_ms` - Processing time
- `tokens` - Token usage (if applicable)
- `confidence` - Output confidence score
- `a2a_depth` - Call chain depth

### A2A-Specific Events
```jsonl
{"event":"a2a_context_received","correlation_id":"xyz-789","call_depth":2}
{"event":"skill_invoked","skill":"skill.your-domain-skill","correlation_id":"xyz-789"}
{"event":"a2a_result_packaged","correlation_id":"xyz-789","confidence":0.95}
```

## Testing

### Unit Test
```bash
pnpm vitest --run --project unit --dir tests/vitest
```

### Integration Test - Direct Invocation (via MAG)
```ts
const delegation = {
  taskId: 'test-1',
  sagId: 'your-a2a-advisor-sag',
  input: { domain_field: 'test', context: { parentRunId: 'mag-test' } }
};
const result = await runtime.delegate?.(delegation);
expect(result?.status).toBe('success');
```

### E2E Test
```bash
pnpm vitest --run --project e2e --dir tests/vitest
```

## Development Notes

### Customization Checklist
- [ ] Update agent.yaml with correct slug, name, and description
- [ ] Define input/output contracts in catalog/contracts/
- [ ] Implement domain logic in src/index.ts
- [ ] Add A2A context handling
- [ ] Implement skill invocation with fallbacks
- [ ] Add comprehensive tests
- [ ] Document A2A capabilities
- [ ] Configure observability for A2A tracing

### A2A Best Practices
1. **Always preserve correlation_id** - Essential for end-to-end tracing
2. **Log call chain depth** - Helps detect circular dependencies
3. **Include processing time in trace** - Enables performance analysis
4. **Handle missing context gracefully** - Don't fail if context is incomplete
5. **Use structured logging** - Makes A2A flows easier to debug

### Future Enhancements
- Support for async processing
- Result caching based on correlation_id
- Automatic context validation
- A2A authentication support
- Circuit breaker integration

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance to the A2A SAG template.
