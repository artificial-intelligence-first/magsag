---
title: OfferOrchestratorMAG Overview
slug: agent-offer-orchestrator-mag
status: living
last_updated: '2025-11-01'
last_synced: '2025-11-01'
tags:
- catalog
- agent
- mag
summary: Regression harness MAG that delegates to compensation advisors and emits
  predictable outputs.
description: Regression harness MAG that delegates to compensation advisors and emits
  predictable outputs.
authors: []
sources: []
---

# OfferOrchestratorMAG (Test Harness)

> **For Humans**: Use this MAG to validate orchestration pipelines and regression suites.
>
> **For AI Agents**: Keep payload formats stable for automated tests. Update SSOT if behaviour changes.

This agent exists solely for automated regression tests. It delegates deterministic payloads to `compensation-advisor-sag`, aggregates their outputs, and exposes predictable results for fast verification.

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance.
