---
title: Cost Optimization Guide
slug: guide-cost-optimization
status: deprecated
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- cost
- optimization
summary: Placeholder guidance while cost analytics migrate from Python scripts to TypeScript observability tools.
description: Notes the removal of Python cost scripts and references observability packages for future automation.
authors: []
sources:
- id: R1
  title: @magsag/observability
  url: ../../packages/observability/src/index.ts
  accessed: '2025-11-06'
---

# Cost Optimization Guide

> Cost analysis scripts written in Python (e.g., `ops/scripts/*.py`) have been retired. Cost telemetry migrates to TypeScript observability packages.

## Current Guidance

- Use `@magsag/observability` to aggregate run metrics.
- Export usage data through the CLI or upcoming TypeScript reporting utilities.
- Document manual analyses in delivery notes until automated tooling ships.

## Validation

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

## Legacy Reference

Retired Python scripts (`ops/scripts/cost_report.py`, etc.) are available in historical commits.
