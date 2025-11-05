---
title: Doc Gen Skill
slug: skill-doc-gen
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- catalog
summary: Generates compensation offer packets from candidate data using reusable SQL templates.
description: Normalises candidate profiles, enriches with salary band guidance fetched via the pg-readonly MCP server, and produces a structured offer packet ready for downstream orchestration.
authors: []
sources: []
---

# Overview

`skill.doc-gen` transforms a normalised candidate profile into a compensation offer packet. The skill validates the input contract, fetches template fragments from the `pg-readonly` MCP server via the generated `servers/pg-readonly/query.ts` module, and renders salary guidance alongside narrative talking points.

## MCP Dependencies

- `pg-readonly` — executed through the generated `query` helper with caching-aware `createPostgresQuery`.

## Inputs

- `candidate_profile` object conforming to `catalog/contracts/candidate_profile.schema.json`.
- Optional overrides such as `template_slug`, `salary_band`, or compensation notes.

## Outputs

- Structured `offer` payload that satisfies `catalog/contracts/offer_packet.schema.json`.
- `analysis.summary` metrics and warning list for downstream review.

## Operational Notes

- All database access is routed through the code-generated module to keep tool payloads outside the LLM context window.
- PII appearing in logs is masked by the workspace sandbox before surfacing to models.
