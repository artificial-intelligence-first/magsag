---
title: Result Aggregation Skill
slug: skill-result-aggregation
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- catalog
summary: Merges heterogeneous result objects into a consolidated record for orchestration steps.
description: Provides lightweight, deterministic result aggregation inside the catalog without outbound MCP calls, keeping long-running workflows side-effect free.
authors: []
sources: []
---

# Overview

`skill.result-aggregation` combines multiple partial result payloads into a single object, preferring the latest values per key. The skill operates purely within the code execution workspace and does not require external MCP servers.

## MCP Dependencies

- None — runs locally inside the execution sandbox.

## Inputs

- `results` (array of objects) — ordered list of result fragments.

## Outputs

- Aggregated object containing the merged key/value pairs.

## Operational Notes

- The sandbox automatically masks any PII encountered in intermediate logs before surfacing to the model.
- Use this skill to consolidate SAG outputs prior to evaluation or reporting steps.
