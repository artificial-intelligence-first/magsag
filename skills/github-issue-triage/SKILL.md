---
title: GitHub Issue Triage Skill
slug: skill-github-issue-triage
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- mcp
summary: Lists repository issues using the GitHub MCP preset with optional label and state filters.
description: Executes the generated `servers/github/list-issues.ts` module so the agent can triage GitHub issues without streaming full tool metadata into the conversation.
authors: []
sources: []
---

# Overview

`skill.github-issue-triage` surfaces GitHub issues for repositories managed by the MAG/SAG workflow. The skill validates owner, repo, label, and state inputs before delegating to the code-generated MCP wrapper.

## MCP Dependencies

- `github` — invoked through `listIssues`, a generated `callMcpTool` helper for the `list_issues` tool.

## Inputs

- `owner` (string) — GitHub organisation or user.
- `repo` (string) — target repository name.
- Optional `labels` (string array) and `state` (`open`, `closed`, `all`).

## Outputs

- `issues` array containing the MCP server response payload ready for downstream routing or summarisation.

## Operational Notes

- Requests leverage the MCP code execution pathway, reducing tool description tokens to maximise LLM context for triage prompts.
- Apply repository-scoped tokens or GitHub App credentials through the `tools/adk/servers/github.yaml` configuration.
