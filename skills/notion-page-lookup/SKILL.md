---
title: Notion Page Lookup Skill
slug: skill-notion-page-lookup
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- mcp
summary: Retrieves Notion page details through the generated MCP wrapper with optional child expansion.
description: Wraps the `retrieve_page` tool exposed by the Notion MCP preset, ensuring only the required payload is streamed back to the agent runtime.
authors: []
sources: []
---

# Overview

`skill.notion-page-lookup` gives agents read access to Notion page metadata. It validates the page identifier, optionally expands children, and delegates to `servers/notion/retrieve-page.ts`.

## MCP Dependencies

- `notion` — executed through the generated `retrievePage` helper built on `callMcpTool`.

## Inputs

- `page_id` (string) — Notion page UUID.
- Optional `include_children` (boolean) — when `true`, fetches the nested block tree.

## Outputs

- `page` object mirroring the Notion MCP response structure.

## Operational Notes

- Secrets and auth headers remain confined to the MCP transport, preventing leakage into model-visible streams.
- Workspace sandbox masking ensures any Notion-derived PII is tokenised before logging.
