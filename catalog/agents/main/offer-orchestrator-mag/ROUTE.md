---
title: OfferOrchestratorMAG Route
slug: agent-offer-orchestrator-mag-route
status: living
last_updated: '2025-11-01'
last_synced: '2025-11-01'
tags:
- catalog
- agent
- routing
summary: Defines the deterministic routing pattern for the OfferOrchestratorMAG regression
  harness.
description: Defines the deterministic routing pattern for the OfferOrchestratorMAG
  regression harness.
authors: []
sources: []
---

# Route

> **For Humans**: Use this routing description to understand how tasks are delegated.
>
> **For AI Agents**: Maintain these routing guarantees when updating the MAG or its skills.

- Accepts optional `message`, `value`, and `numbers` fields.
- Creates two deterministic tasks targeting `compensation-advisor-sag`.
- Aggregates numeric summaries and returns them with metadata.

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance.
