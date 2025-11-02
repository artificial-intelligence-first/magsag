# Notion Page Lookup Skill

## Summary
- Fetch metadata for a Notion page using the standard MCP HTTP endpoint.
- Optional `include_children` flag forwards child block hydration to the server.

## Inputs
- `page_id` *(string, required)* – Notion page identifier.
- `include_children` *(boolean, optional)* – Request nested content when available.

## Outputs
- `page` – Raw payload returned by the Notion MCP server.

## Behaviour
- Requires `mcp:notion` permission.
- Enforces agent-level MCP policies before executing the request.
- Surface failures using `SkillMCPError` so MAG/SAG callers can react accordingly.
