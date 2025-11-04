---
title: Semantic Cache Guide
slug: guide-semantic-cache
status: deprecated
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- cache
- optimization
summary: Indicates that the semantic cache implementation is being ported to TypeScript.
description: Interim note while TypeScript observability and storage layers replace the Python cache utilities.
authors: []
sources:
- id: R1
  title: @magsag/observability
  url: ../../packages/observability/src/flow-summary.ts
  accessed: '2025-11-06'
---

# Semantic Cache Guide

> The semantic cache previously implemented in Python is under re-design. TypeScript observability components will supply new caching primitives.

## Current Guidance

- Avoid relying on the legacy cache. Capture necessary context in delivery notes.
- Track updates in Workstream B for storage abstractions.

## Validation

- `pnpm -r lint`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm docs:lint`
- `pnpm catalog:validate`

## Legacy Reference

Refer to commits prior to the TypeScript migration for archival behaviour.
