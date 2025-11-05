---
title: Salary Band Lookup Skill
slug: skill-salary-band-lookup
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- mcp
summary: Fetches salary band ranges from the read-only Postgres catalog.
description: Queries the `salary_bands` table via the generated pg-readonly helper to provide currency-aware compensation guidance during offer generation.
authors: []
sources: []
---

# Overview

`skill.salary-band-lookup` provides deterministic salary band ranges for a given role, level, and location. The skill calls the generated `servers/pg-readonly/query.ts` module to keep the raw SQL and result sets outside the LLM token budget.

## MCP Dependencies

- `pg-readonly` — executed through the `query` helper built on `createPostgresQuery`.

## Inputs

- `role` (string)
- `level` (string)
- `location` (string)

## Outputs

- `{ currency, min, max, source }` payload representing the salary band.

## Operational Notes

- Numeric coercion ensures downstream consumers receive canonical number types even when the database returns strings.
- Audit logs capture masked details of each query invocation for governance reviews.
