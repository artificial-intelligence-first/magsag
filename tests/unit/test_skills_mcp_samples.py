from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from magsag.mcp.tool import MCPToolResult
from magsag.registry import Registry
from magsag.skills.base import SkillMCPError


def _load_skill(entrypoint: str) -> Any:
    registry = Registry()
    return registry.resolve_entrypoint(entrypoint)


NOTION_RUN = _load_skill("catalog/skills/notion-page-lookup/impl/notion_page.py:run")
SUPABASE_RUN = _load_skill("catalog/skills/supabase-sql-readonly/impl/sql_readonly.py:run")
GITHUB_RUN = _load_skill("catalog/skills/github-issue-triage/impl/issue_triage.py:run")
OBSIDIAN_RUN = _load_skill("catalog/skills/obsidian-note-append/impl/note_append.py:run")


def _runtime_with_result(result: MCPToolResult) -> SimpleNamespace:
    return SimpleNamespace(
        execute_tool=AsyncMock(return_value=result),
        check_permission=lambda server_id: True,
    )


@pytest.mark.asyncio
async def test_notion_page_lookup_success() -> None:
    runtime = _runtime_with_result(
        MCPToolResult(success=True, output={"id": "123"}, metadata={"transport": "http"})
    )
    result = await NOTION_RUN({"page_id": "123"}, mcp=runtime)
    assert result["page"] == {"id": "123"}
    runtime.execute_tool.assert_awaited_with(
        server_id="notion",
        tool_name="retrieve_page",
        arguments={"page_id": "123"},
    )


@pytest.mark.asyncio
async def test_notion_page_lookup_failure() -> None:
    runtime = _runtime_with_result(
        MCPToolResult(success=False, output=None, error="boom", metadata={})
    )
    with pytest.raises(SkillMCPError):
        await NOTION_RUN({"page_id": "abc"}, mcp=runtime)


@pytest.mark.asyncio
async def test_supabase_sql_readonly_success() -> None:
    runtime = _runtime_with_result(
        MCPToolResult(success=True, output={"rows": [1]}, metadata={"transport": "http"})
    )
    result = await SUPABASE_RUN({"sql": "SELECT 1"}, mcp=runtime)
    assert result["rows"] == {"rows": [1]}
    runtime.execute_tool.assert_awaited_with(
        server_id="supabase",
        tool_name="sql_select",
        arguments={"sql": "SELECT 1"},
    )


@pytest.mark.asyncio
async def test_supabase_sql_allows_cte() -> None:
    runtime = _runtime_with_result(
        MCPToolResult(success=True, output={"rows": [1]}, metadata={"transport": "http"})
    )
    sql = "WITH recent AS (SELECT 1) SELECT * FROM recent"
    result = await SUPABASE_RUN({"sql": sql}, mcp=runtime)
    assert result["rows"] == {"rows": [1]}
    runtime.execute_tool.assert_awaited_with(
        server_id="supabase",
        tool_name="sql_select",
        arguments={"sql": sql},
    )


@pytest.mark.asyncio
async def test_supabase_sql_rejects_mutating_statement() -> None:
    runtime = SimpleNamespace(
        execute_tool=AsyncMock(),
        check_permission=lambda server_id: True,
    )
    with pytest.raises(SkillMCPError):
        await SUPABASE_RUN({"sql": "UPDATE accounts SET active = false"}, mcp=runtime)
    runtime.execute_tool.assert_not_called()


@pytest.mark.asyncio
async def test_github_issue_triage_invocation() -> None:
    runtime = _runtime_with_result(
        MCPToolResult(success=True, output=[{"number": 1}], metadata={"transport": "http"})
    )
    result = await GITHUB_RUN({"owner": "org", "repo": "repo"}, mcp=runtime)
    assert result["issues"] == [{"number": 1}]
    runtime.execute_tool.assert_awaited_with(
        server_id="github",
        tool_name="list_issues",
        arguments={"owner": "org", "repo": "repo"},
    )


@pytest.mark.asyncio
async def test_obsidian_note_append_success() -> None:
    runtime = _runtime_with_result(
        MCPToolResult(success=True, output={"ok": True}, metadata={"transport": "stdio"})
    )
    payload = {"path": "notes/daily.md", "content": "Added entry"}
    result = await OBSIDIAN_RUN(payload, mcp=runtime)
    assert result["result"] == {"ok": True}
    runtime.execute_tool.assert_awaited_with(
        server_id="obsidian",
        tool_name="append_note",
        arguments=payload,
    )
