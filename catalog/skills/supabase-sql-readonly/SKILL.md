# Supabase SQL Read-only Skill

## Summary
- Executes parameterised `SELECT` queries through the Supabase MCP server.
- Defaults to read-only mode and enforces agent policies before execution.

## Inputs
- `sql` *(string, required)* – Parameterised SQL statement (SELECT only).
- `params` *(array, optional)* – Positional parameters for the query.

## Outputs
- `rows` – Result set returned by the Supabase MCP server, including row count.

## Behaviour
- Requires `mcp:supabase` permission.
- Rejects non-SELECT statements at the skill layer.
- Surfaces MCP failures via `SkillMCPError`.
