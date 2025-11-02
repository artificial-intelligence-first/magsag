"""Inspection utilities for MCP server configurations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from magsag.mcp.config import MCPServerConfig, TransportDefinition


@dataclass(slots=True)
class TransportView:
    """Serializable view of a transport definition."""

    type: str
    endpoint: str | None
    command: str | None
    args: list[str]
    headers: dict[str, str]
    env_keys: list[str]


@dataclass(slots=True)
class ConfigInspection:
    """Structured inspection payload for CLI rendering."""

    server_id: str
    version: str | None
    description: str | None
    notes: str | None
    limits: Dict[str, Any]
    permissions: Dict[str, Any]
    transports: list[TransportView]
    options: Dict[str, Any]


def _build_transport_view(transport: TransportDefinition) -> TransportView:
    endpoint = transport.url
    if transport.type == "stdio" and transport.command:
        endpoint = transport.command

    return TransportView(
        type=transport.type,
        endpoint=endpoint,
        command=transport.command,
        args=list(transport.args or []),
        headers=dict(transport.headers or {}),
        env_keys=sorted((transport.env or {}).keys()),
    )


def inspect_config(config: MCPServerConfig) -> ConfigInspection:
    """Build an inspection payload for the given config."""

    transports = [_build_transport_view(t) for t in config.transport_chain()]

    permissions_payload: Dict[str, Any] = {
        "scope": list(config.permissions.scope),
        "write_requires_approval": config.permissions.write_requires_approval,
        "tools": dict(config.permissions.tools),
        "extra": dict(config.permissions.extra),
    }

    return ConfigInspection(
        server_id=config.server_id,
        version=config.version,
        description=config.description,
        notes=config.notes,
        limits=config.limits.model_dump(),
        permissions=permissions_payload,
        transports=transports,
        options=dict(config.options),
    )


def inspection_as_lines(config: MCPServerConfig) -> list[str]:
    """Render inspection output as human-readable lines."""

    payload = inspect_config(config)
    lines: list[str] = []

    lines.append(f"Server ID: {payload.server_id}")
    if payload.version:
        lines.append(f"Version: {payload.version}")
    if payload.description:
        lines.append(f"Description: {payload.description}")
    if payload.notes:
        lines.append(f"Notes: {payload.notes}")

    lines.append("Limits:")
    for key, value in payload.limits.items():
        lines.append(f"  {key}: {value}")

    lines.append("Permissions:")
    lines.append(f"  scope: {', '.join(payload.permissions['scope']) or '-'}")
    if payload.permissions["write_requires_approval"] is not None:
        lines.append(
            f"  write_requires_approval: {payload.permissions['write_requires_approval']}"
        )
    if payload.permissions["tools"]:
        lines.append("  tools:")
        for tool_name, policy in payload.permissions["tools"].items():
            lines.append(f"    {tool_name}: {policy}")
    if payload.permissions["extra"]:
        lines.append("  extra:")
        for key, value in payload.permissions["extra"].items():
            lines.append(f"    {key}: {value}")

    if payload.transports:
        lines.append("Transports:")
        for idx, transport in enumerate(payload.transports, start=1):
            lines.append(f"  [{idx}] type: {transport.type}")
            if transport.endpoint:
                lines.append(f"      endpoint: {transport.endpoint}")
            if transport.command:
                lines.append(f"      command: {transport.command}")
            if transport.args:
                lines.append(f"      args: {' '.join(transport.args)}")
            if transport.headers:
                lines.append("      headers:")
                for key, value in transport.headers.items():
                    lines.append(f"        {key}: {value}")
            if transport.env_keys:
                lines.append(f"      env: {', '.join(transport.env_keys)}")

    if payload.options:
        lines.append("Options:")
        for key, value in payload.options.items():
            lines.append(f"  {key}: {value}")

    return lines
