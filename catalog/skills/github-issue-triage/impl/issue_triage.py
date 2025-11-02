"""GitHub issue triage skill powered by the MCP runtime."""

from __future__ import annotations

from typing import Any

from magsag.mcp import MCPRuntime
from magsag.mcp.tool import MCPToolResult
from magsag.skills.base import SkillBase, SkillMCPError

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "owner": {"type": "string", "description": "Repository owner"},
        "repo": {"type": "string", "description": "Repository name"},
        "state": {
            "type": "string",
            "enum": ["open", "closed", "all"],
            "description": "Issue state filter",
        },
        "labels": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Optional label filters",
        },
    },
    "required": ["owner", "repo"],
}


async def run(payload: dict[str, Any], mcp: MCPRuntime | None) -> dict[str, Any]:
    """List GitHub issues for repositories using MCP."""

    SkillBase.validate_payload(payload, INPUT_SCHEMA, "github_issue_triage_input")
    SkillBase.requires_mcp(mcp, "github")

    assert mcp is not None

    arguments: dict[str, Any] = {
        "owner": payload["owner"],
        "repo": payload["repo"],
    }
    if "state" in payload:
        arguments["state"] = payload["state"]
    if "labels" in payload:
        arguments["labels"] = payload["labels"]

    result: MCPToolResult = await mcp.execute_tool(
        server_id="github",
        tool_name="list_issues",
        arguments=arguments,
    )

    if not result.success:
        raise SkillMCPError(result.error or "GitHub list_issues failed")

    return {"issues": result.output}
