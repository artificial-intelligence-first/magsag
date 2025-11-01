---
title: CompensationAdvisorSAG Overview
slug: agent-compensation-advisor-sag
status: living
last_updated: '2025-11-01'
last_synced: '2025-11-01'
tags:
- catalog
- agent
- sag
summary: Deterministic SAG harness that transforms numeric inputs for regression testing.
description: Deterministic SAG harness that transforms numeric inputs for regression
  testing.
authors: []
sources: []
---

# CompensationAdvisorSAG (Test Harness)

> **For Humans**: Use this SAG to validate downstream aggregation logic during tests.
>
> **For AI Agents**: Keep outputs stable and traceable for automated verification.

Deterministic sub-agent used during automated tests. It calls the `skill.test-helper-transform` skill, summarises numeric inputs, and reports observability-friendly metadata.

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance.
