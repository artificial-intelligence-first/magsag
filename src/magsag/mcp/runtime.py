"""MCP Runtime for skills integration.

This module provides the runtime interface for skills to access
MCP tools with proper permission enforcement.
"""

from __future__ import annotations

import logging
from contextlib import nullcontext
from typing import Any, Protocol

from magsag.core.permissions import mask_tool_args
from magsag.mcp.tool import MCPTool, MCPToolResult
from magsag.observability.context import get_current_agent_policies
from magsag.observability.logger import ObservabilityLogger

try:  # pragma: no cover - optional dependency
    from opentelemetry import trace
    from opentelemetry.trace import Span
except ImportError:  # pragma: no cover - optional dependency
    trace = None
    Span = Any

logger = logging.getLogger(__name__)


class MCPRuntimeError(Exception):
    """Base exception for MCP runtime errors."""

    pass


class MCPRegistryProtocol(Protocol):
    """Protocol describing the registry interface required by MCPRuntime."""

    def get_tools(self, server_id: str) -> list[MCPTool]:
        ...

    async def execute_tool(
        self,
        *,
        server_id: str,
        tool_name: str,
        arguments: dict[str, Any],
        required_permissions: list[str],
    ) -> MCPToolResult:
        ...


class MCPRuntime:
    """Runtime interface for skills to access MCP tools.

    This class provides a controlled interface for skills to
    discover and execute MCP tools, with permission enforcement.
    """

    def __init__(
        self,
        registry: MCPRegistryProtocol,
        observer: ObservabilityLogger | None = None,
    ) -> None:
        """Initialize MCP runtime.

        Args:
            registry: MCP registry managing server connections
        """
        self._registry = registry
        self._granted_permissions: set[str] = set()
        self._observer: ObservabilityLogger | None = observer

    def grant_permissions(self, permissions: list[str]) -> None:
        """Grant permissions to this runtime instance.

        This method should be called when initializing the runtime
        for a specific skill, based on the skill's declared permissions.

        Args:
            permissions: List of permissions in format "mcp:<server_id>"
        """
        self._granted_permissions.update(permissions)
        logger.debug(f"Granted permissions: {permissions}")

    def revoke_permissions(self, permissions: list[str]) -> None:
        """Revoke previously granted permissions.

        Args:
            permissions: List of permissions to revoke
        """
        self._granted_permissions.difference_update(permissions)
        logger.debug(f"Revoked permissions: {permissions}")

    def get_granted_permissions(self) -> list[str]:
        """Get list of currently granted permissions.

        Returns:
            List of granted permission strings
        """
        return list(self._granted_permissions)

    def attach_observer(self, observer: ObservabilityLogger | None) -> None:
        """Attach an observability logger for MCP call tracing."""
        self._observer = observer

    def _record_observability(
        self,
        server_id: str,
        tool_name: str,
        arguments: dict[str, Any],
        result: MCPToolResult,
    ) -> None:
        if self._observer is None:
            return

        metadata = dict(result.metadata)
        meta_payload = metadata.pop("meta", None)

        try:
            masked_args = mask_tool_args(dict(arguments))
        except Exception:  # noqa: BLE001 - defensive
            masked_args = {}

        record = {
            "server_id": server_id,
            "tool": tool_name,
            "status": "success" if result.success else "error",
            "transport": metadata.get("transport"),
            "latency_ms": metadata.get("latency_ms"),
            "protocol_version": metadata.get("protocol_version"),
            "session_id": metadata.get("session_id"),
            "http_status": metadata.get("http_status"),
            "retries": metadata.get("retries"),
            "permission": metadata.get("permission"),
            "arguments": masked_args,
        }
        if result.error:
            record["error"] = result.error
        if meta_payload is not None:
            record["meta"] = meta_payload

        self._observer.log_mcp_call(record)

    def list_available_tools(self) -> list[MCPTool]:
        """List all tools available with current permissions.

        Returns:
            List of tools from servers this runtime has permission to access
        """
        available_tools: list[MCPTool] = []

        for permission in self._granted_permissions:
            if not permission.startswith("mcp:"):
                continue

            server_id = permission[4:]  # Remove "mcp:" prefix
            tools = self._registry.get_tools(server_id)
            available_tools.extend(tools)

        return available_tools

    def check_permission(self, server_id: str) -> bool:
        """Check if runtime has permission to access a server.

        Args:
            server_id: ID of the server to check

        Returns:
            True if permission is granted, False otherwise
        """
        permission = f"mcp:{server_id}"
        return permission in self._granted_permissions

    @staticmethod
    def _resolve_policy(server_id: str, tool_name: str) -> str | None:
        policies = get_current_agent_policies() or {}
        tools_policy = policies.get("tools") if isinstance(policies, dict) else None
        if not isinstance(tools_policy, dict):
            return None

        qualified = f"{server_id}.{tool_name}"
        value = tools_policy.get(qualified)
        if isinstance(value, str):
            return value.lower()

        wildcard = tools_policy.get(f"{server_id}.*")
        if isinstance(wildcard, str):
            return wildcard.lower()

        return None

    async def execute_tool(
        self,
        server_id: str,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> MCPToolResult:
        """Execute an MCP tool with permission enforcement.

        Args:
            server_id: ID of the server providing the tool
            tool_name: Name of the tool to execute
            arguments: Tool input arguments

        Returns:
            Tool execution result

        Raises:
            MCPRuntimeError: If permission is denied
        """
        # Check permission
        if not self.check_permission(server_id):
            error_msg = (
                f"Permission denied: skill does not have access to server '{server_id}'. "
                f"Required permission: mcp:{server_id}"
            )
            logger.warning(error_msg)
            return MCPToolResult(
                success=False,
                error=error_msg,
            )

        # Execute tool via registry
        # Only validate the specific permission for this server, not all MCP permissions
        # (avoids false failures when skill has multiple MCP permissions and one is invalid)
        required_permission = f"mcp:{server_id}"
        logger.info(f"Executing tool {server_id}.{tool_name}")

        policy_action = self._resolve_policy(server_id, tool_name)
        if policy_action == "deny":
            error_msg = f"Tool '{server_id}.{tool_name}' is denied by agent policy"
            logger.warning(error_msg)
            result = MCPToolResult(
                success=False,
                error=error_msg,
                metadata={
                    "server_id": server_id,
                    "tool_name": tool_name,
                    "permission": required_permission,
                    "policy": "deny",
                },
            )
            self._record_observability(server_id, tool_name, arguments, result)
            return result

        if policy_action == "require-approval":
            error_msg = (
                f"Tool '{server_id}.{tool_name}' requires human approval per agent policy"
            )
            logger.warning(error_msg)
            result = MCPToolResult(
                success=False,
                error=error_msg,
                metadata={
                    "server_id": server_id,
                    "tool_name": tool_name,
                    "permission": required_permission,
                    "policy": "require-approval",
                },
            )
            self._record_observability(server_id, tool_name, arguments, result)
            return result

        span_cm = nullcontext()
        span: Span | None
        if trace is not None:  # pragma: no cover - optional instrumentation
            tracer = trace.get_tracer("magsag.mcp.runtime")
            span_cm = tracer.start_as_current_span(
                "mcp.call",
                attributes={
                    "mcp.server_id": server_id,
                    "mcp.tool_name": tool_name,
                },
            )

        with span_cm as span:
            result = await self._registry.execute_tool(
                server_id=server_id,
                tool_name=tool_name,
                arguments=arguments,
                required_permissions=[required_permission],
            )

            metadata = result.metadata
            metadata.setdefault("server_id", server_id)
            metadata.setdefault("tool_name", tool_name)
            metadata.setdefault("permission", required_permission)
            if policy_action:
                metadata.setdefault("policy", policy_action)

            if span is not None:
                span.set_attribute("mcp.transport", metadata.get("transport", "unknown"))
                span.set_attribute("mcp.latency_ms", metadata.get("latency_ms", 0))
                span.set_attribute("mcp.protocol_version", metadata.get("protocol_version", "unknown"))
                span.set_attribute("mcp.session_id", metadata.get("session_id", ""))
                span.set_attribute("mcp.status", "success" if result.success else "error")
                if not result.success and result.error:
                    span.set_attribute("mcp.error", result.error)

        if result.success:
            logger.info(f"Tool execution succeeded: {server_id}.{tool_name}")
        else:
            logger.warning(f"Tool execution failed: {server_id}.{tool_name} - {result.error}")

        self._record_observability(server_id, tool_name, arguments, result)

        return result

    async def query_postgres(
        self,
        server_id: str,
        sql: str,
        params: list[Any] | None = None,
    ) -> MCPToolResult:
        """Convenience method for executing PostgreSQL queries.

        Args:
            server_id: ID of the PostgreSQL server
            sql: SQL SELECT query
            params: Optional query parameters

        Returns:
            Query result
        """
        arguments: dict[str, Any] = {"sql": sql}
        if params:
            arguments["params"] = params

        return await self.execute_tool(
            server_id=server_id,
            tool_name="query",
            arguments=arguments,
        )

    async def list_postgres_tables(
        self,
        server_id: str,
        schema: str = "public",
    ) -> MCPToolResult:
        """Convenience method for listing PostgreSQL tables.

        Args:
            server_id: ID of the PostgreSQL server
            schema: Database schema name (default: public)

        Returns:
            List of tables
        """
        return await self.execute_tool(
            server_id=server_id,
            tool_name="list_tables",
            arguments={"schema": schema},
        )
