"""Append content to Obsidian notes using the MCP runtime."""

from __future__ import annotations

from typing import Any

from magsag.mcp import MCPRuntime
from magsag.mcp.tool import MCPToolResult
from magsag.skills.base import SkillBase, SkillMCPError

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "path": {
            "type": "string",
            "description": "Vault-relative path to the note (e.g. notes/daily.md)",
        },
        "content": {
            "type": "string",
            "description": "Markdown content to append to the note",
        },
        "create_if_missing": {
            "type": "boolean",
            "description": "Create file when absent (defaults to false)",
        },
    },
    "required": ["path", "content"],
}


async def run(payload: dict[str, Any], mcp: MCPRuntime | None) -> dict[str, Any]:
    """Append text to an Obsidian note."""

    SkillBase.validate_payload(payload, INPUT_SCHEMA, "obsidian_note_append_input")
    SkillBase.requires_mcp(mcp, "obsidian")

    assert mcp is not None

    arguments: dict[str, Any] = {
        "path": payload["path"],
        "content": payload["content"],
    }
    if "create_if_missing" in payload:
        arguments["create_if_missing"] = bool(payload["create_if_missing"])

    result: MCPToolResult = await mcp.execute_tool(
        server_id="obsidian",
        tool_name="append_note",
        arguments=arguments,
    )

    if not result.success:
        raise SkillMCPError(result.error or "Obsidian append_note failed")

    return {"result": result.output}
