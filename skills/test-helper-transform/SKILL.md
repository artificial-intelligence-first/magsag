---
title: Test Helper Transform Skill
slug: skill-test-helper-transform
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- catalog
summary: Deterministic transform used in unit tests to validate skill orchestration.
description: Applies simple arithmetic and string transforms to demonstrate skill invocation plumbing without hitting external MCP services.
authors: []
sources: []
---

# Overview

`skill.test-helper-transform` exists to support catalog unit and integration tests. It does not reach out to MCP servers and instead performs basic arithmetic and string manipulations to verify orchestration flows.

## MCP Dependencies

- None — executes entirely in-process.

## Inputs

- `text` (string)
- `value` (number)
- `numbers` (number array)

## Outputs

- Uppercased variants, numeric aggregates, and instrumentation fields consumed by tests.

## Operational Notes

- Because the skill is deterministic and side-effect free, it is safe to run inside the sandbox during test harness execution.
- Any incidental PII in test payloads is masked by the shared workspace middleware before logging.
