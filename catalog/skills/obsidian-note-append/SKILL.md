# Obsidian Note Append Skill

## Summary
- Appends markdown content to an Obsidian note exposed through the `mcp-obsidian` server.

## Inputs
- `path` *(string, required)* – Vault-relative file path (e.g., `notes/daily.md`).
- `content` *(string, required)* – Markdown content to append.
- `create_if_missing` *(boolean, optional)* – Create the note when it does not exist.

## Outputs
- `result` – Raw response from the Obsidian MCP server including append status metadata.

## Behaviour
- Requires `mcp:obsidian` permission and is subject to policy controls (delete operations are denied).
- On failure raises `SkillMCPError` with the MCP error payload.
