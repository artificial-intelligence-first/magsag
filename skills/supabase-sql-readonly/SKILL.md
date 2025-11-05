---
title: Supabase SQL Readonly Skill
slug: skill-supabase-sql-readonly
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- mcp
summary: Executes parameterised read-only SQL against the Supabase MCP preset.
description: Validates SQL input, enforces read-only semantics, and delegates to the generated `sqlSelect` helper to avoid streaming Supabase tool metadata.
authors: []
sources: []
---

# Overview

`skill.supabase-sql-readonly` enables agents to run safe `SELECT` queries against Supabase-hosted Postgres projects. Mutating statements are rejected before the MCP call is attempted.

## MCP Dependencies

- `supabase` — invoked via `servers/supabase/sql-select.ts` using `callMcpTool`.

## Inputs

- `sql` (string) — must begin with `SELECT` after comments are stripped.
- Optional `params` (array) — positional parameter values.

## Outputs

- `{ rows: [...] }` wrapper containing the Supabase query result.

## Operational Notes

- The sandbox filters mutating keywords even when quoted or embedded in comments, preventing accidental write operations.
- Log output is masked and recorded in the workspace audit log for future inspection.
