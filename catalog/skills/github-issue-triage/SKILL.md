# GitHub Issue Triage Skill

## Summary
- Lists GitHub repository issues through the GitHub MCP server to support triage and reporting flows.

## Inputs
- `owner` *(string, required)* – Repository owner or organisation.
- `repo` *(string, required)* – Repository name.
- `state` *(string, optional)* – Issue state filter (`open`, `closed`, `all`).
- `labels` *(array, optional)* – Label filters applied server-side.

## Outputs
- `issues` – Normalised issue payload returned by the MCP server.

## Behaviour
- Requires `mcp:github` permission and honours agent policies for write actions.
- Read-only calls should succeed without additional approval; write paths are blocked by default policies.
