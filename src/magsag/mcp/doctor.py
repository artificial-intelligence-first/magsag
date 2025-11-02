"""Connectivity diagnostics for MCP server presets."""

from __future__ import annotations

import contextlib
from dataclasses import dataclass
from typing import Any, Iterable

import httpx

try:  # pragma: no cover - optional dependency
    from mcp.client.session import ClientSession
    from mcp.client.streamable_http import streamablehttp_client
    from mcp.client.sse import sse_client
    from mcp.client.stdio import StdioServerParameters, stdio_client
    from mcp.types import Implementation, Tool

    HAS_MCP_SDK = True
except ImportError:  # pragma: no cover - optional dependency
    ClientSession = None
    streamablehttp_client = None
    sse_client = None
    stdio_client = None
    StdioServerParameters = None
    Implementation = None
    Tool = Any
    HAS_MCP_SDK = False

from magsag import __version__ as MAG_VERSION
from magsag.mcp.config import MCPServerConfig, TransportDefinition


@dataclass(slots=True)
class ProbeResult:
    """Result of probing a single transport definition."""

    transport: TransportDefinition
    status: str
    message: str | None
    tool_names: list[str]
    session_id: str | None
    protocol_version: str | None
    http_status: int | None


@dataclass(slots=True)
class DoctorReport:
    """Aggregated probe results for a server configuration."""

    server_id: str
    status: str
    probes: list[ProbeResult]


CLIENT_INFO = Implementation(name="magsag-cli", version=MAG_VERSION) if HAS_MCP_SDK else None
NEEDS_AUTH_CODES = {401}
AUTH_FAILED_CODES = {403, 451}


def _timeout_seconds(transport: TransportDefinition, config: MCPServerConfig) -> float:
    return float(transport.timeout or config.limits.timeout_s)


async def _initialize_and_list_tools(session: Any) -> tuple[str | None, list[Any]]:
    init_result = await session.initialize()
    tools_result = await session.list_tools()
    return init_result.protocolVersion, tools_result.tools


def _map_http_error(error: httpx.HTTPStatusError) -> tuple[str, str]:
    status_code = error.response.status_code
    detail = f"HTTP {status_code}: {error.response.reason_phrase}"
    if status_code in NEEDS_AUTH_CODES:
        return "needs-auth", detail
    if status_code in AUTH_FAILED_CODES:
        return "auth-failed", detail
    return "unreachable", detail


async def _probe_http(transport: TransportDefinition, config: MCPServerConfig) -> ProbeResult:
    if not HAS_MCP_SDK:
        raise RuntimeError("MCP SDK not installed. Install with: pip install mcp")
    assert transport.url, "HTTP transport requires url"
    if ClientSession is None or streamablehttp_client is None:
        raise RuntimeError("MCP HTTP client support is unavailable")

    timeout = _timeout_seconds(transport, config)
    try:
        async with streamablehttp_client(
            transport.url,
            headers=transport.headers or None,
            timeout=timeout,
        ) as (read_stream, write_stream, get_session_id):
            async with ClientSession(read_stream, write_stream, client_info=CLIENT_INFO) as session:
                protocol_version, tools = await _initialize_and_list_tools(session)
                protocol_version = str(protocol_version) if protocol_version is not None else None
                session_id = None
                with contextlib.suppress(Exception):
                    session_id = get_session_id()
                return ProbeResult(
                    transport=transport,
                    status="reachable",
                    message=None,
                    tool_names=[tool.name for tool in tools],
                    session_id=session_id,
                    protocol_version=protocol_version,
                    http_status=200,
                )
    except httpx.HTTPStatusError as exc:  # pragma: no cover - network edge
        status, detail = _map_http_error(exc)
        return ProbeResult(
            transport=transport,
            status=status,
            message=detail,
            tool_names=[],
            session_id=None,
            protocol_version=None,
            http_status=exc.response.status_code,
        )
    except Exception as exc:  # noqa: BLE001
        return ProbeResult(
            transport=transport,
            status="unreachable",
            message=str(exc),
            tool_names=[],
            session_id=None,
            protocol_version=None,
            http_status=None,
        )


async def _probe_sse(transport: TransportDefinition, config: MCPServerConfig) -> ProbeResult:
    if not HAS_MCP_SDK:
        raise RuntimeError("MCP SDK not installed. Install with: pip install mcp")
    assert transport.url, "SSE transport requires url"
    if ClientSession is None or sse_client is None:
        raise RuntimeError("MCP SSE client support is unavailable")
    timeout = _timeout_seconds(transport, config)

    try:
        async with sse_client(
            transport.url,
            headers=transport.headers or None,
            timeout=timeout,
        ) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream, client_info=CLIENT_INFO) as session:
                protocol_version, tools = await _initialize_and_list_tools(session)
                protocol_version = str(protocol_version) if protocol_version is not None else None
                return ProbeResult(
                    transport=transport,
                    status="reachable",
                    message=None,
                    tool_names=[tool.name for tool in tools],
                    session_id=None,
                    protocol_version=protocol_version,
                    http_status=None,
                )
    except httpx.HTTPStatusError as exc:  # pragma: no cover - network edge
        status, detail = _map_http_error(exc)
        return ProbeResult(
            transport=transport,
            status=status,
            message=detail,
            tool_names=[],
            session_id=None,
            protocol_version=None,
            http_status=exc.response.status_code,
        )
    except Exception as exc:  # noqa: BLE001
        return ProbeResult(
            transport=transport,
            status="unreachable",
            message=str(exc),
            tool_names=[],
            session_id=None,
            protocol_version=None,
            http_status=None,
        )


async def _probe_stdio(transport: TransportDefinition, config: MCPServerConfig) -> ProbeResult:
    if not HAS_MCP_SDK:
        raise RuntimeError("MCP SDK not installed. Install with: pip install mcp")
    assert transport.command, "STDIO transport requires command"
    if ClientSession is None or stdio_client is None or StdioServerParameters is None:
        raise RuntimeError("MCP stdio client support is unavailable")

    params = StdioServerParameters(
        command=transport.command,
        args=transport.args or [],
        env=transport.env or None,
    )

    try:
        async with stdio_client(params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream, client_info=CLIENT_INFO) as session:
                protocol_version, tools = await _initialize_and_list_tools(session)
                protocol_version = str(protocol_version) if protocol_version is not None else None
                return ProbeResult(
                    transport=transport,
                    status="reachable",
                    message=None,
                    tool_names=[tool.name for tool in tools],
                    session_id=None,
                    protocol_version=protocol_version,
                    http_status=None,
                )
    except Exception as exc:  # noqa: BLE001
        return ProbeResult(
            transport=transport,
            status="unreachable",
            message=str(exc),
            tool_names=[],
            session_id=None,
            protocol_version=None,
            http_status=None,
        )


async def probe_transport(config: MCPServerConfig, transport: TransportDefinition) -> ProbeResult:
    """Probe a transport according to its type."""

    match transport.type:
        case "http":
            return await _probe_http(transport, config)
        case "sse":
            return await _probe_sse(transport, config)
        case "stdio":
            return await _probe_stdio(transport, config)
        case "websocket":  # pragma: no cover - future transport
            return ProbeResult(
                transport=transport,
                status="unreachable",
                message="WebSocket transport probing is not yet implemented",
                tool_names=[],
                session_id=None,
                protocol_version=None,
                http_status=None,
            )
        case _:
            return ProbeResult(
                transport=transport,
                status="unreachable",
                message=f"Unsupported transport type: {transport.type}",
                tool_names=[],
                session_id=None,
                protocol_version=None,
                http_status=None,
            )


async def diagnose(config: MCPServerConfig) -> DoctorReport:
    if not HAS_MCP_SDK:
        raise RuntimeError("MCP SDK not installed. Install with: pip install mcp")
    """Diagnose connectivity for a server configuration."""

    probes: list[ProbeResult] = []
    transports = config.transport_chain()

    if not transports:
        return DoctorReport(
            server_id=config.server_id,
            status="unreachable",
            probes=[],
        )

    for transport in transports:
        result = await probe_transport(config, transport)
        probes.append(result)
        if result.status in {"reachable", "needs-auth", "auth-failed"}:
            return DoctorReport(
                server_id=config.server_id,
                status=result.status,
                probes=probes,
            )

    return DoctorReport(
        server_id=config.server_id,
        status="unreachable",
        probes=probes,
    )


async def diagnose_many(configs: Iterable[MCPServerConfig]) -> list[DoctorReport]:
    results: list[DoctorReport] = []
    for config in configs:
        report = await diagnose(config)
        results.append(report)
    return results
