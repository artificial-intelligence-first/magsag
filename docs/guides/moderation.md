---
title: Moderation Guide
slug: guide-moderation
status: deprecated
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- moderation
- governance
summary: Placeholder note while moderation flows migrate to TypeScript packages.
description: Indicates that the Python moderation tools were removed and points to governance packages for successors.
authors: []
sources:
- id: R1
  title: @magsag/governance
  url: ../../packages/governance/src/index.ts
  accessed: '2025-11-06'
---

# Moderation Guide

> Moderation helpers previously shipped in Python. Governance logic now lives in `packages/governance` and `packages/observability`.

## Current Guidance

- Use `@magsag/governance` for policy evaluation.
- Record manual moderation notes in ExecPlans and deliverables.
- Update `docs/policies/security.md` when moderation guidance changes.

## Validation

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

## Legacy Reference

Python moderation scripts were removed during Workstream F.
