"""Skill for retrieving Notion pages via the MCP runtime."""

from __future__ import annotations

from typing import Any

from magsag.mcp import MCPRuntime
from magsag.mcp.tool import MCPToolResult
from magsag.skills.base import SkillBase, SkillMCPError

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "page_id": {
            "type": "string",
            "description": "Notion page identifier (UUID or short ID).",
        },
        "include_children": {
            "type": "boolean",
            "description": "Request nested child blocks when available.",
        },
    },
    "required": ["page_id"],
}


async def run(payload: dict[str, Any], mcp: MCPRuntime | None) -> dict[str, Any]:
    """Retrieve Notion page metadata using MCP."""

    SkillBase.validate_payload(payload, INPUT_SCHEMA, "notion_page_lookup_input")
    SkillBase.requires_mcp(mcp, "notion")

    assert mcp is not None  # for type checkers; SkillBase ensures this

    arguments: dict[str, Any] = {"page_id": payload["page_id"]}
    if "include_children" in payload:
        arguments["include_children"] = bool(payload["include_children"])

    result: MCPToolResult = await mcp.execute_tool(
        server_id="notion",
        tool_name="retrieve_page",
        arguments=arguments,
    )

    if not result.success:
        raise SkillMCPError(result.error or "Notion retrieve_page failed")

    return {"page": result.output}
