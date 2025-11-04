---
title: SAG Template Overview
slug: agent-template-sag
status: living
last_updated: '2025-11-01'
last_synced: '2025-11-01'
tags:
- catalog
- agent
- template
- sag
summary: Template for documenting sub-agents, including contracts, responsibilities,
  and testing.
description: Template for documenting sub-agents, including contracts, responsibilities,
  and testing.
authors: []
sources: []
---

# YourAdvisorSAG

> **For Humans**: Use this template when documenting a sub-agent.
>
> **For AI Agents**: Populate every section with concrete behaviour, schemas, and error handling details.

**Role:** Sub-Agent (SAG)
**Version:** 0.1.0
**Status:** Template

## Overview

[Describe this SAG's specialized task and domain expertise]

## Responsibilities

- Execute domain-specific logic
- Return structured output conforming to contract
- Handle errors gracefully with meaningful messages

## Input Contract

**Schema:** `contracts/your_advisor_input.schema.json`

Example:
```json
{
  "domain_field": "value",
  "parameters": {
    "param1": 123
  }
}
```

## Output Contract

**Schema:** `contracts/your_advisor_output.schema.json`

Example:
```json
{
  "result": {
    "processed_field": "value"
  },
  "confidence": 0.95,
  "notes": "Optional explanatory text"
}
```

## Dependencies

### Skills
- `skill.your-domain-skill` - [Describe skill purpose]

## Execution Logic

1. **Input Validation** - Validate against input schema
2. **Domain Processing** - Apply specialized logic
3. **Skill Invocation** - Call required skills
4. **Output Formatting** - Package results per schema

## Error Handling

- **Invalid Input:** Return error with validation details
- **Skill Failure:** Log error and return partial/default result
- **Unexpected Exception:** Propagate with diagnostic context

## Observability

Executions produce metrics:
- `latency_ms` - Processing time
- `tokens` - Token usage (if applicable)
- `confidence` - Output confidence score

## Testing

```bash
# Unit test (place specs under tests/vitest/agents)
pnpm vitest --run --project unit --dir tests/vitest

# (SAGs are typically invoked by MAGs rather than directly via CLI)
```

## Development Notes

[Add implementation notes, known limitations, future enhancements]

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance to the SAG template.
