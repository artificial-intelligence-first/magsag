from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from magsag.mcp.runtime import MCPRuntime
from magsag.mcp.tool import MCPToolResult
from magsag.observability.context import use_agent_policies
from magsag.observability.logger import ObservabilityLogger


class StubRegistry:
    """Minimal MCP registry stub that records invocations."""

    def __init__(self, result: MCPToolResult | None = None) -> None:
        self._result = result
        self.calls: list[dict[str, Any]] = []

    async def execute_tool(
        self,
        *,
        server_id: str,
        tool_name: str,
        arguments: dict[str, Any],
        required_permissions: list[str],
    ) -> MCPToolResult:
        self.calls.append(
            {
                "server_id": server_id,
                "tool_name": tool_name,
                "arguments": dict(arguments),
                "required_permissions": list(required_permissions),
            }
        )
        if self._result is None:
            raise AssertionError("StubRegistry.execute_tool called without configured result")
        return self._result

    def get_tools(self, server_id: str) -> list[Any]:
        return []


class FailingObserver(ObservabilityLogger):
    def log_mcp_call(self, record: dict[str, Any]) -> None:
        raise ValueError("boom")


@pytest.mark.asyncio
async def test_policy_deny_blocks_execution() -> None:
    registry = StubRegistry()
    runtime = MCPRuntime(registry=registry)
    runtime.grant_permissions(["mcp:notion"])

    with use_agent_policies({"tools": {"notion.retrieve_page": "deny"}}):
        result = await runtime.execute_tool("notion", "retrieve_page", {"page_id": "123"})

    assert not result.success
    assert result.metadata["policy"] == "deny"
    assert registry.calls == []


@pytest.mark.asyncio
async def test_policy_require_approval_blocks_execution() -> None:
    registry = StubRegistry()
    runtime = MCPRuntime(registry=registry)
    runtime.grant_permissions(["mcp:supabase"])

    with use_agent_policies({"tools": {"supabase.sql_select": "require-approval"}}):
        result = await runtime.execute_tool("supabase", "sql_select", {"sql": "SELECT 1"})

    assert not result.success
    assert result.metadata["policy"] == "require-approval"
    assert registry.calls == []


@pytest.mark.asyncio
async def test_policy_allow_delegates_to_registry() -> None:
    mcp_result = MCPToolResult(success=True, output={"ok": True}, metadata={"transport": "http"})
    registry = StubRegistry(result=mcp_result)
    runtime = MCPRuntime(registry=registry)
    runtime.grant_permissions(["mcp:github"])

    with use_agent_policies({"tools": {"github.list_issues": "allow"}}):
        result = await runtime.execute_tool("github", "list_issues", {"owner": "org", "repo": "repo"})

    assert result is mcp_result
    assert len(registry.calls) == 1


@pytest.mark.asyncio
async def test_observer_logging_called(tmp_path: Path) -> None:
    observer = ObservabilityLogger(run_id="test", base_dir=tmp_path)
    mcp_result = MCPToolResult(success=True, output={}, metadata={"transport": "http", "latency_ms": 10})
    registry = StubRegistry(result=mcp_result)
    runtime = MCPRuntime(registry=registry, observer=observer)
    runtime.grant_permissions(["mcp:notion"])

    await runtime.execute_tool("notion", "retrieve_page", {"page_id": "xyz"})
    # Observer writes to file; ensure one record was logged in memory
    assert observer.run_dir.exists()
    ledger_path = observer.run_dir / "mcp_calls.jsonl"
    assert ledger_path.exists()


@pytest.mark.asyncio
async def test_observer_failure_does_not_break_execution(tmp_path: Path) -> None:
    observer = FailingObserver(run_id="fail", base_dir=tmp_path)
    mcp_result = MCPToolResult(success=True, output={"ok": True}, metadata={"transport": "stdio"})
    registry = StubRegistry(result=mcp_result)
    runtime = MCPRuntime(registry=registry, observer=observer)
    runtime.grant_permissions(["mcp:github"])

    result = await runtime.execute_tool("github", "list_issues", {})

    assert result is mcp_result
    assert len(registry.calls) == 1
