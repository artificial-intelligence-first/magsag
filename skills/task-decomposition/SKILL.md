---
title: Task Decomposition Skill
slug: skill-task-decomposition
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- catalog
summary: Splits a high-level task into ordered subtasks for SAG orchestration.
description: Provides deterministic decomposition logic without relying on MCP servers, ensuring planning remains transparent and auditable.
authors: []
sources: []
---

# Overview

`skill.task-decomposition` produces a structured list of subtasks suitable for delegation to specialist agents. It operates locally inside the execution workspace and is often the first step in MAG plans.

## MCP Dependencies

- None — pure catalog logic.

## Inputs

- `task` (string) — narrative description or goal statement.
- Optional metadata fields consumed by downstream policies.

## Outputs

- Ordered array of subtasks with titles, descriptions, and acceptance criteria.

## Operational Notes

- The skill is safe to reuse in offline or air-gapped workspaces because it does not require external tool access.
- When combined with the workspace sandbox, decomposition logs are recorded with PII masked for audit purposes.
