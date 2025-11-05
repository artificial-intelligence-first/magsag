---
title: Obsidian Note Append Skill
slug: skill-obsidian-note-append
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- mcp
summary: Appends Markdown content to Obsidian vault notes via the local MCP bridge.
description: Validates note metadata, calls the generated `appendNote` helper, and ensures note creation or append operations stay within the execution sandbox.
authors: []
sources: []
---

# Overview

`skill.obsidian-note-append` integrates with the Obsidian Local REST API MCP server to append Markdown content to notes. Optional creation flags allow the agent to materialise new notes when missing.

## MCP Dependencies

- `obsidian` — routed through `servers/obsidian/append-note.ts` using `callMcpTool`.

## Inputs

- `path` (string) — relative note path.
- `content` (string) — Markdown payload to append.
- Optional `create_if_missing` (boolean).

## Outputs

- `result` metadata emitted by the MCP server (e.g., confirmation status).

## Operational Notes

- Vault location and API key are controlled via the preset in `tools/adk/servers/obsidian.yaml`; no credentials reach the LLM context.
- Workspace audit logs capture masked summaries of each append for traceability.
