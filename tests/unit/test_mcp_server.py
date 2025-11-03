from __future__ import annotations

from contextlib import AsyncExitStack, asynccontextmanager
from types import SimpleNamespace
from typing import Any, AsyncIterator, cast

import pytest

from magsag.mcp.config import MCPServerConfig, TransportDefinition
from magsag.mcp.server import (
    ActiveConnection,
    MCPServer,
    MCPServerError,
    _is_read_only_postgres_query,
)
from magsag.mcp.tool import MCPTool, MCPToolSchema


class _StubSession:
    async def call_tool(self, tool_name: str, arguments: dict[str, object]) -> SimpleNamespace:
        return SimpleNamespace(
            isError=True,
            structuredContent=None,
            content=[],
            meta=None,
            error=None,
        )


class _StubConnection:
    def __init__(self) -> None:
        self.transport = SimpleNamespace(type="http")
        self.stack = None
        self.session = _StubSession()
        self.session_id_cb = None
        self.session_id = None
        self.protocol_version = "1.0"
        self.retries = 0


class _StubErrorSessionNoContent:
    async def call_tool(self, tool_name: str, arguments: dict[str, object]) -> SimpleNamespace:
        return SimpleNamespace(
            isError=True,
            structuredContent=None,
            content=None,
            meta={"message": "failure"},
            error=None,
        )


@pytest.mark.asyncio
async def test_execute_tool_without_meta_message_uses_fallback_error() -> None:
    config = MCPServerConfig(
        server_id="stub",
        type="mcp",
        transport=TransportDefinition(type="stdio", command="npx", args=["-y", "stub"]),
    )
    server = MCPServer(config)
    server._started = True  # noqa: SLF001 - internal setup for unit test
    server._connection = cast(ActiveConnection | None, cast(Any, _StubConnection()))  # noqa: SLF001
    server._tools = {  # noqa: SLF001
        "echo": MCPTool(
            name="echo",
            description="",
            input_schema=MCPToolSchema(),
            server_id="stub",
        )
    }

    result = await server.execute_tool("echo", {})

    assert not result.success
    assert result.error == "MCP tool returned an error"


@pytest.mark.asyncio
async def test_execute_tool_error_without_content_is_handled() -> None:
    config = MCPServerConfig(
        server_id="stub",
        type="mcp",
        transport=TransportDefinition(type="stdio", command="npx", args=["-y", "stub"]),
    )
    server = MCPServer(config)
    server._started = True  # noqa: SLF001
    server._connection = cast(
        ActiveConnection | None,
        cast(
            Any,
            SimpleNamespace(
                transport=SimpleNamespace(type="http"),
                stack=None,
                session=_StubErrorSessionNoContent(),
                session_id_cb=None,
                session_id=None,
                protocol_version="1.0",
                retries=0,
            ),
        ),
    )
    server._tools = {  # noqa: SLF001
        "echo": MCPTool(
            name="echo",
            description="",
            input_schema=MCPToolSchema(),
            server_id="stub",
        )
    }

    result = await server.execute_tool("echo", {})

    assert not result.success
    assert result.error == "failure"
    assert result.output is None


@pytest.mark.asyncio
async def test_connection_retries_count_after_transport_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    config = MCPServerConfig(
        server_id="stub",
        transport=TransportDefinition(type="http", url="https://primary.example"),
        fallback=[TransportDefinition(type="stdio", command="npx", args=["-y", "stub"])],
    )
    server = MCPServer(config)

    call_state = {"count": 0}

    async def fake_connect(self: MCPServer, transport: TransportDefinition) -> tuple[ActiveConnection, list[Any]]:
        call_state["count"] += 1
        if call_state["count"] == 1:
            raise MCPServerError("HTTP transport failure")

        connection = ActiveConnection(
            transport=transport,
            stack=AsyncExitStack(),
            session=SimpleNamespace(),  # minimal stub; no immediate usage in this test
            session_id_cb=None,
            session_id=None,
            protocol_version="1.0",
        )
        return connection, []

    monkeypatch.setattr(MCPServer, "_connect_transport", fake_connect, raising=False)
    monkeypatch.setattr(MCPServer, "_register_tools_from_payload", lambda self, payload: None, raising=False)
    monkeypatch.setattr("magsag.mcp.server.HAS_MCP_SDK", True)

    await server.start()

    assert server._connection is not None  # noqa: SLF001
    assert server._connection.retries == 1  # noqa: SLF001
    assert len(server._transport_errors) == 1  # noqa: SLF001

    await server.stop()


@pytest.mark.asyncio
async def test_stdio_transport_allows_empty_args_override(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_args: list[list[str]] = []

    class DummyStdioParams:
        def __init__(self, *, command: str, args: list[str], env: dict[str, str] | None) -> None:
            self.command = command
            self.args = args
            self.env = env
            captured_args.append(list(args))

    @asynccontextmanager
    async def dummy_stdio_client(params: DummyStdioParams) -> AsyncIterator[tuple[Any, Any]]:
        yield SimpleNamespace(), SimpleNamespace()

    class DummyClientSession:
        def __init__(self, read_stream: Any, write_stream: Any, client_info: Any) -> None:
            self._initialized = False

        async def __aenter__(self) -> DummyClientSession:
            return self

        async def __aexit__(
            self,
            exc_type: type[BaseException] | None,
            exc: BaseException | None,
            tb: BaseException | None,
        ) -> None:
            return None

        async def initialize(self) -> SimpleNamespace:
            return SimpleNamespace(protocolVersion="1.0")

        async def list_tools(self) -> SimpleNamespace:
            return SimpleNamespace(tools=[])

    monkeypatch.setattr("magsag.mcp.server.HAS_MCP_SDK", True)
    monkeypatch.setattr("magsag.mcp.server.ClientSession", DummyClientSession)
    monkeypatch.setattr("magsag.mcp.server.StdioServerParameters", DummyStdioParams)
    monkeypatch.setattr("magsag.mcp.server.stdio_client", dummy_stdio_client)

    config_override = MCPServerConfig(
        server_id="stdio-override",
        transport=TransportDefinition(
            type="stdio",
            command="base-command",
            args=[],
        ),
    )
    server_override = MCPServer(config_override)
    transport_override = config_override.transport
    assert transport_override is not None
    assert "args" in transport_override.model_fields_set
    await server_override._connect_transport(transport_override)

    config_inherit = MCPServerConfig(
        server_id="stdio-inherit",
        transport=TransportDefinition(
            type="stdio",
            command="base-command",
            args=["--default"],
        ),
    )
    server_inherit = MCPServer(config_inherit)
    transport_inherit = config_inherit.transport
    assert transport_inherit is not None
    assert "args" in transport_inherit.model_fields_set
    await server_inherit._connect_transport(transport_inherit)

    assert captured_args[0] == []
    assert captured_args[1] == ["--default"]


def test_is_read_only_allows_quoted_keyword_identifiers() -> None:
    assert _is_read_only_postgres_query('SELECT "DELETE" FROM foo')
    assert _is_read_only_postgres_query('WITH t AS (SELECT 1) SELECT "INSERT" FROM t')


def test_is_read_only_rejects_select_into() -> None:
    assert not _is_read_only_postgres_query("SELECT * INTO new_table FROM foo")
    assert not _is_read_only_postgres_query(
        "WITH base AS (SELECT 1) SELECT * INTO TEMP tmp_table FROM base"
    )
