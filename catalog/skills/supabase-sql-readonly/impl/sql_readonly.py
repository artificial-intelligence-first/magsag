"""Supabase read-only SQL skill leveraging the MCP runtime."""

from __future__ import annotations

from typing import Any

from magsag.mcp import MCPRuntime
from magsag.mcp.server import _is_read_only_postgres_query
from magsag.mcp.tool import MCPToolResult
from magsag.skills.base import SkillBase, SkillMCPError

INPUT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "sql": {
            "type": "string",
            "description": "Read-only SQL statement (validated for safe execution)",
        },
        "params": {
            "type": "array",
            "description": "Optional positional parameters for the SQL query",
            "items": {"type": ["string", "number", "boolean", "null"]},
        },
    },
    "required": ["sql"],
}


async def run(payload: dict[str, Any], mcp: MCPRuntime | None) -> dict[str, Any]:
    """Execute a read-only SQL query against Supabase via MCP."""

    SkillBase.validate_payload(payload, INPUT_SCHEMA, "supabase_sql_readonly_input")
    SkillBase.requires_mcp(mcp, "supabase")

    assert mcp is not None

    sql = payload["sql"].strip()
    if not _is_read_only_postgres_query(sql):
        raise SkillMCPError(
            "Only read-only SELECT statements are permitted for Supabase read-only skill"
        )

    arguments: dict[str, Any] = {"sql": sql}
    if "params" in payload:
        arguments["params"] = payload["params"]

    result: MCPToolResult = await mcp.execute_tool(
        server_id="supabase",
        tool_name="sql_select",
        arguments=arguments,
    )

    if not result.success:
        raise SkillMCPError(result.error or "Supabase sql_select failed")

    return {"rows": result.output}
