---
title: Result Aggregation Skill
slug: skill-result-aggregation
status: living
last_updated: '2025-11-01'
last_synced: '2025-11-01'
tags:
- catalog
- skill
- orchestration
summary: Aggregates outputs from multiple SAG executions into a unified offer packet.
authors: []
sources: []
name: result-aggregation
description: 'Aggregates results from multiple sub-agent executions into a unified
  output.

  '
iface:
  input_schema: list of result payloads from SAG executions
  output_schema: catalog/contracts/offer_packet.schema.json
slo:
  success_rate_min: 0.99
  latency_p95_ms: 200
---

# Result Aggregation (result-aggregation)

> **For Humans**: Use this skill to merge SAG outputs into a single offer packet.
>
> **For AI Agents**: Maintain deterministic merge behaviour and document any schema changes in SSOT.

## Purpose
Surface the first successful SAG result and provide a deterministic fallback when multiple results are available.

## When to Use
- MAG execution collects outputs from one or more `compensation-advisor-sag` runs.
- The orchestration flow needs a stable aggregation step even when sub-agents partially fail.

## Procedures
1. Inspect the `results` list supplied by the caller.
2. Return `{}` when no successful results are present.
3. When exactly one result exists, return it unchanged.
4. When multiple results exist, merge dictionaries with later entries taking precedence. This mirrors the current Phase 2 behavior and can be replaced with domain-specific resolution later.

## Examples
`{"results": [{"offer": {...}}, {"offer": {..., "metadata": {...}}]}` → merged dictionary with second result’s overrides.

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance.
