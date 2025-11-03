"""MCP Server connection management.

This module handles connections to individual MCP servers,
including lifecycle management and tool execution.
"""

from __future__ import annotations

import contextlib
import logging
import os
import re
import time
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Callable, cast

from magsag import __version__ as MAG_VERSION
from magsag.mcp.config import MCPServerConfig, TransportDefinition
from magsag.mcp.tool import MCPTool, MCPToolResult, MCPToolSchema

ClientSession: Any
streamablehttp_client: Callable[..., Any] | None
sse_client: Callable[..., Any] | None
stdio_client: Callable[..., Any] | None
StdioServerParameters: Any
Implementation: Any
MCPToolDescriptor: Any

HAS_MCP_SDK = False
try:  # pragma: no cover - optional dependency
    from mcp.client.session import ClientSession as _ClientSession
    from mcp.client.streamable_http import streamablehttp_client as _streamablehttp_client
    from mcp.client.sse import sse_client as _sse_client
    from mcp.client.stdio import StdioServerParameters as _StdioServerParameters, stdio_client as _stdio_client
    from mcp.types import Implementation as _Implementation, Tool as _MCPToolDescriptor
except ImportError:  # pragma: no cover - optional dependency
    ClientSession = cast(Any, None)
    streamablehttp_client = cast(Callable[..., Any] | None, None)
    sse_client = cast(Callable[..., Any] | None, None)
    stdio_client = cast(Callable[..., Any] | None, None)
    StdioServerParameters = cast(Any, None)
    Implementation = cast(Any, None)
    MCPToolDescriptor = cast(Any, None)
else:
    ClientSession = _ClientSession
    streamablehttp_client = _streamablehttp_client
    sse_client = _sse_client
    stdio_client = _stdio_client
    StdioServerParameters = _StdioServerParameters
    Implementation = _Implementation
    MCPToolDescriptor = _MCPToolDescriptor
    HAS_MCP_SDK = True

logger = logging.getLogger(__name__)

CLIENT_INFO = (
    Implementation(name="magsag-runtime", version=MAG_VERSION) if HAS_MCP_SDK else None
)

_COMMENT_RE = re.compile(r"--[^\n]*|/\*.*?\*/", re.DOTALL)
_DOLLAR_QUOTE_RE = re.compile(r"\$([A-Za-z0-9_]*)\$(?:.|\n)*?\$\1\$", re.DOTALL)
_SINGLE_QUOTE_RE = re.compile(r"(?i)E?'([^']|'')*'")
_DOUBLE_QUOTED_IDENTIFIER_RE = re.compile(r'"([^"]|"")*"', re.DOTALL)
_MUTATING_STATEMENT_RE = re.compile(
    r"\b(INSERT|UPDATE|DELETE|MERGE|ALTER|CREATE|DROP|TRUNCATE|GRANT|REVOKE|VACUUM|ANALYZE)\b",
    re.IGNORECASE,
)
_SELECT_INTO_RE = re.compile(r"\bSELECT\b[\s\S]+?\bINTO\b", re.IGNORECASE)


def _strip_leading_sql_comments(statement: str) -> str:
    """Remove leading whitespace and comments from an SQL statement."""
    idx = 0
    length = len(statement)

    while idx < length:
        while idx < length and statement[idx].isspace():
            idx += 1

        if statement.startswith("--", idx):
            newline = statement.find("\n", idx + 2)
            if newline == -1:
                return ""
            idx = newline + 1
            continue

        if statement.startswith("/*", idx):
            end = statement.find("*/", idx + 2)
            if end == -1:
                return ""
            idx = end + 2
            continue

        break

    return statement[idx:]


def _strip_sql_comments(statement: str) -> str:
    """Remove inline SQL comments."""
    return _COMMENT_RE.sub(" ", statement)


def _strip_sql_string_literals(statement: str) -> str:
    """Remove SQL string and dollar-quoted literals."""

    def _replace_dollar(match: re.Match[str]) -> str:
        return " "

    without_dollar = _DOLLAR_QUOTE_RE.sub(_replace_dollar, statement)
    return _SINGLE_QUOTE_RE.sub(" ", without_dollar)


def _strip_double_quoted_identifiers(statement: str) -> str:
    """Remove double-quoted identifiers from SQL."""
    return _DOUBLE_QUOTED_IDENTIFIER_RE.sub(" ", statement)


def _is_read_only_postgres_query(sql: str) -> bool:
    """Check whether the provided PostgreSQL query is read-only."""
    stripped = _strip_leading_sql_comments(sql).lstrip()
    if not stripped:
        return False

    scrubbed = _strip_double_quoted_identifiers(
        _strip_sql_string_literals(_strip_sql_comments(stripped))
    ).strip()

    if _MUTATING_STATEMENT_RE.search(scrubbed):
        return False

    upper_head = stripped.upper()
    upper_scrubbed = scrubbed.upper()

    if _SELECT_INTO_RE.search(upper_scrubbed):
        return False

    if upper_head.startswith("SELECT"):
        return True

    if upper_head.startswith("WITH"):
        return "SELECT" in upper_scrubbed

    return False


@dataclass(slots=True)
class ActiveConnection:
    """Active MCP transport session."""

    transport: TransportDefinition
    stack: AsyncExitStack
    session: Any
    session_id_cb: Callable[[], str | None] | None
    session_id: str | None
    protocol_version: str | None
    retries: int = 0

# Optional import for PostgreSQL support
try:
    import asyncpg

    HAS_ASYNCPG = True
except ImportError:
    HAS_ASYNCPG = False
    asyncpg = None


class MCPServerError(Exception):
    """Base exception for MCP server errors."""

    pass


class MCPServer:
    """Manages connection to a single MCP server.

    This class handles the lifecycle of an MCP server connection,
    including starting/stopping processes, discovering tools, and
    executing tool calls.
    """

    def __init__(self, config: MCPServerConfig) -> None:
        """Initialize MCP server with configuration.

        Args:
            config: Server configuration loaded from YAML
        """
        self.config = config
        self._tools: dict[str, MCPTool] = {}
        self._pg_pool: Any = None  # asyncpg.Pool[Any] | None (if asyncpg is installed)
        self._started: bool = False
        self._connection: ActiveConnection | None = None
        self._transport_errors: list[tuple[TransportDefinition, Exception]] = []

    @property
    def server_id(self) -> str:
        """Get the server ID."""
        return self.config.server_id

    @property
    def is_started(self) -> bool:
        """Check if the server is started."""
        return self._started

    async def start(self) -> None:
        """Start the MCP server and discover available tools.

        Raises:
            MCPServerError: If server fails to start
        """
        if self._started:
            return

        if self.config.type == "mcp":
            await self._start_mcp_connection()
        elif self.config.type == "postgres":
            await self._start_postgres_connection()
        else:
            raise MCPServerError(f"Unknown server type: {self.config.type}")

        self._started = True

    async def stop(self) -> None:
        """Stop the MCP server and clean up resources."""
        if not self._started:
            return

        if self._connection is not None:
            with contextlib.suppress(Exception):
                await self._connection.stack.aclose()
            self._connection = None

        if self._pg_pool:
            await self._pg_pool.close()
            self._pg_pool = None

        self._started = False
        self._tools.clear()

    async def _start_mcp_connection(self) -> None:
        """Establish an MCP connection with transport fallback."""

        if not HAS_MCP_SDK:
            raise MCPServerError(
                "MCP SDK not installed. Install with: pip install mcp"
            )

        transports = self.config.transport_chain()
        if not transports:
            raise MCPServerError(f"Server {self.server_id} has no transports configured")

        self._transport_errors.clear()

        for transport in transports:
            try:
                connection, tools = await self._connect_transport(transport)
            except Exception as exc:  # noqa: BLE001
                self._transport_errors.append((transport, exc))
                logger.warning(
                    "Transport %s failed for server %s: %s",
                    transport.type,
                    self.server_id,
                    exc,
                )
                continue

            tools_payload = [tool.model_dump(by_alias=True) for tool in tools]
            connection.retries = len(self._transport_errors)
            self._register_tools_from_payload(tools_payload)
            self._connection = connection
            logger.info(
                "Connected to MCP server %s via %s",
                self.server_id,
                transport.type,
            )
            return

        messages = [
            f"{err[0].type}: {err[1]}" for err in self._transport_errors
        ]
        raise MCPServerError(
            f"Failed to establish MCP connection for {self.server_id}: {'; '.join(messages)}"
        )

    async def _connect_transport(
        self, transport: TransportDefinition
    ) -> tuple[ActiveConnection, list[Any]]:
        if ClientSession is None:
            raise MCPServerError("MCP SDK not installed.")

        stack = AsyncExitStack()
        connection: ActiveConnection | None = None

        try:
            if transport.type == "http":
                if not transport.url:
                    raise MCPServerError("HTTP transport requires 'url'")
                if streamablehttp_client is None:
                    raise MCPServerError("HTTP transport requires MCP HTTP client support")
                timeout = float(transport.timeout or self.config.limits.timeout_s)
                read_stream, write_stream, get_session_id = await stack.enter_async_context(
                    streamablehttp_client(
                        transport.url,
                        headers=transport.headers or None,
                        timeout=timeout,
                    )
                )
            elif transport.type == "sse":
                if not transport.url:
                    raise MCPServerError("SSE transport requires 'url'")
                if sse_client is None:
                    raise MCPServerError("SSE transport requires MCP SSE client support")
                timeout = float(transport.timeout or self.config.limits.timeout_s)
                read_stream, write_stream = await stack.enter_async_context(
                    sse_client(
                        transport.url,
                        headers=transport.headers or None,
                        timeout=timeout,
                    )
                )
                get_session_id = None
            elif transport.type == "stdio":
                command = transport.command
                if not command:
                    raise MCPServerError("STDIO transport requires 'command'")
                if stdio_client is None or StdioServerParameters is None:
                    raise MCPServerError("STDIO transport requires MCP stdio client support")
                merged_env = dict(transport.env)
                args = list(transport.args)
                params = StdioServerParameters(
                    command=command,
                    args=args,
                    env=merged_env,
                )
                read_stream, write_stream = await stack.enter_async_context(stdio_client(params))
                get_session_id = None
            else:
                raise MCPServerError(f"Unsupported transport type: {transport.type}")

            session = await stack.enter_async_context(
                ClientSession(read_stream, write_stream, client_info=CLIENT_INFO)
            )

            init_result = await session.initialize()
            tools_result = await session.list_tools()

            session_id = None
            if get_session_id is not None:
                with contextlib.suppress(Exception):
                    session_id = get_session_id()

            connection = ActiveConnection(
                transport=transport,
                stack=stack,
                session=session,
                session_id_cb=get_session_id,
                session_id=session_id,
                protocol_version=str(init_result.protocolVersion),
            )

            return connection, tools_result.tools

        except Exception:
            await stack.aclose()
            raise

    async def _start_postgres_connection(self) -> None:
        """Start PostgreSQL connection pool.

        Raises:
            MCPServerError: If connection configuration is missing or invalid
        """
        if not HAS_ASYNCPG:
            raise MCPServerError(
                f"PostgreSQL server '{self.server_id}' requires asyncpg package. "
                "Install it with: pip install asyncpg"
            )

        if not self.config.conn:
            raise MCPServerError(f"No connection config for PostgreSQL server {self.server_id}")

        url_env = self.config.conn.url_env
        conn_url = os.getenv(url_env)

        if not conn_url:
            raise MCPServerError(
                f"Environment variable {url_env} not set for PostgreSQL server {self.server_id}"
            )

        try:
            self._pg_pool = await asyncpg.create_pool(
                conn_url,
                min_size=1,
                max_size=5,
                timeout=self.config.limits.timeout_s,
            )

            # Discover PostgreSQL "tools" (common query operations)
            await self._discover_postgres_tools()

        except Exception as e:
            raise MCPServerError(f"Failed to connect to PostgreSQL: {e}") from e

    async def _discover_postgres_tools(self) -> None:
        """Discover available PostgreSQL tools (query operations)."""
        # Define standard PostgreSQL query tools
        self._tools = {
            "query": MCPTool(
                name="query",
                description="Execute a SELECT query on the database",
                input_schema=MCPToolSchema(
                    type="object",
                    properties={
                        "sql": {
                            "type": "string",
                            "description": "SQL SELECT query to execute",
                        },
                        "params": {
                            "type": "array",
                            "description": "Query parameters for parameterized queries",
                            "items": {"type": "string"},
                        },
                    },
                    required=["sql"],
                ),
                server_id=self.server_id,
            ),
            "list_tables": MCPTool(
                name="list_tables",
                description="List all tables in the database",
                input_schema=MCPToolSchema(
                    type="object",
                    properties={
                        "schema": {
                            "type": "string",
                            "description": "Database schema name (default: public)",
                        },
                    },
                    required=[],
                ),
                server_id=self.server_id,
            ),
        }

    def get_tools(self) -> list[MCPTool]:
        """Get list of available tools from this server.

        Returns:
            List of tool definitions
        """
        return list(self._tools.values())

    async def execute_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> MCPToolResult:
        """Execute a tool on this MCP server.

        Args:
            tool_name: Name of the tool to execute
            arguments: Tool input arguments

        Returns:
            Tool execution result

        Raises:
            MCPServerError: If server is not started or tool is not found
        """
        if not self._started:
            raise MCPServerError(f"Server {self.server_id} is not started")

        if tool_name not in self._tools:
            return MCPToolResult(
                success=False,
                error=f"Tool '{tool_name}' not found on server {self.server_id}",
            )

        start_time = time.time()

        try:
            if self.config.type == "postgres":
                result = await self._execute_postgres_tool(tool_name, arguments)
                result.metadata.setdefault("transport", "postgres")
                result.metadata.setdefault("server_id", self.server_id)
                result.metadata.setdefault("latency_ms", int((time.time() - start_time) * 1000))
                return result

            if self._connection is None:
                raise MCPServerError(
                    f"MCP connection for server {self.server_id} is not established"
                )

            connection = self._connection
            call_result = await connection.session.call_tool(tool_name, arguments or {})

            latency_ms = int((time.time() - start_time) * 1000)
            output: Any
            if call_result.structuredContent is not None:
                output = call_result.structuredContent
            else:
                content = getattr(call_result, "content", None)
                if content is None:
                    output = [] if not call_result.isError else None
                else:
                    output = [item.model_dump(by_alias=True) for item in content]

            if connection.session_id_cb is not None:
                with contextlib.suppress(Exception):
                    connection.session_id = connection.session_id_cb()

            metadata = {
                "server_id": self.server_id,
                "transport": connection.transport.type,
                "protocol_version": connection.protocol_version,
                "session_id": connection.session_id,
                "latency_ms": latency_ms,
                "retries": connection.retries,
            }
            if call_result.meta:
                metadata["meta"] = call_result.meta

            success = not call_result.isError
            error_message = None
            if not success:
                error_payload = call_result.meta or {}
                if isinstance(error_payload, dict):
                    error_message = (
                        error_payload.get("message")
                        or error_payload.get("error")
                        or error_payload.get("detail")
                    )
                if not error_message:
                    error_attr = getattr(call_result, "error", None)
                    if isinstance(error_attr, str) and error_attr:
                        error_message = error_attr
                if not error_message:
                    message_attr = getattr(call_result, "message", None)
                    if isinstance(message_attr, str) and message_attr:
                        error_message = message_attr
                if not error_message:
                    error_message = "MCP tool returned an error"

            return MCPToolResult(
                success=success,
                output=output if success else None,
                error=error_message,
                metadata=metadata,
            )

        except Exception as exc:
            latency_ms = int((time.time() - start_time) * 1000)
            transport_type = None
            if self._connection is not None:
                transport_type = self._connection.transport.type
            return MCPToolResult(
                success=False,
                error=str(exc),
                metadata={
                    "server_id": self.server_id,
                    "transport": transport_type,
                    "latency_ms": latency_ms,
                },
            )

    def _register_tools_from_payload(self, tools_payload: list[dict[str, Any]]) -> None:
        self._tools.clear()
        for raw_tool in tools_payload or []:
            name = raw_tool.get("name")
            if not isinstance(name, str):
                continue

            description = raw_tool.get("description", "")
            input_schema_payload = raw_tool.get("inputSchema", {}) or {}

            schema = MCPToolSchema(
                type=input_schema_payload.get("type", "object"),
                properties=input_schema_payload.get("properties", {}),
                required=input_schema_payload.get("required", []),
            )

            tool = MCPTool(
                name=name,
                description=description,
                input_schema=schema,
                server_id=self.server_id,
            )
            self._tools[name] = tool

    async def _execute_postgres_tool(
        self,
        tool_name: str,
        arguments: dict[str, Any],
    ) -> MCPToolResult:
        """Execute a PostgreSQL tool.

        Args:
            tool_name: Name of the tool
            arguments: Tool arguments

        Returns:
            Tool execution result
        """
        if not self._pg_pool:
            return MCPToolResult(
                success=False,
                error="PostgreSQL connection pool not initialized",
            )

        try:
            async with self._pg_pool.acquire() as conn:
                if tool_name == "query":
                    sql = arguments.get("sql", "")
                    params = arguments.get("params", [])

                    # Validate that query is read-only
                    if not _is_read_only_postgres_query(sql):
                        return MCPToolResult(
                            success=False,
                            error="Only SELECT queries are allowed in read-only mode",
                        )

                    rows = await conn.fetch(sql, *params)
                    result_data = [dict(row) for row in rows]

                    return MCPToolResult(
                        success=True,
                        output={"rows": result_data, "count": len(result_data)},
                    )

                elif tool_name == "list_tables":
                    schema = arguments.get("schema", "public")
                    sql = """
                        SELECT table_name
                        FROM information_schema.tables
                        WHERE table_schema = $1
                        ORDER BY table_name
                    """
                    rows = await conn.fetch(sql, schema)
                    tables = [row["table_name"] for row in rows]

                    return MCPToolResult(
                        success=True,
                        output={"tables": tables, "count": len(tables)},
                    )

                else:
                    return MCPToolResult(
                        success=False,
                        error=f"Unknown PostgreSQL tool: {tool_name}",
                    )

        except Exception as e:
            return MCPToolResult(
                success=False,
                error=f"PostgreSQL execution error: {str(e)}",
            )
