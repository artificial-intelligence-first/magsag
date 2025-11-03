"""MCP Server configuration data models.

This module defines the data models for MCP server configurations,
which are loaded from generated .mcp/servers/*.json artefacts.
"""

from __future__ import annotations

import os
from collections.abc import Mapping, Sequence
from typing import Any, Dict, Literal, Optional

from pydantic import AliasChoices, BaseModel, Field, model_validator


def _expand_string(value: str, env: Mapping[str, str] | None = None) -> str:
    """Expand shell-style placeholders in a string, supporting nested expressions."""
    env = env or os.environ
    result: list[str] = []
    i = 0
    length = len(value)

    while i < length:
        if value.startswith("${", i):
            j = i + 2
            depth = 1
            while j < length and depth > 0:
                if value.startswith("${", j):
                    depth += 1
                    j += 2
                    continue
                if value[j] == "}":
                    depth -= 1
                    if depth == 0:
                        expr = value[i + 2 : j]
                        replacement = _evaluate_placeholder(expr, env)
                        result.append(replacement)
                        j += 1
                        break
                    j += 1
                    continue
                j += 1
            else:
                # Unmatched brace; append remainder and exit
                result.append(value[i:])
                return "".join(result)

            i = j
            continue

        result.append(value[i])
        i += 1

    return "".join(result)


def _evaluate_placeholder(expr: str, env: Mapping[str, str]) -> str:
    if ":+" in expr:
        var, text = expr.split(":+", 1)
        var = var.strip()
        if env.get(var, ""):
            return _expand_string(text, env)
        return ""
    if ":-" in expr:
        var, text = expr.split(":-", 1)
        var = var.strip()
        if env.get(var, ""):
            return env[var]
        return _expand_string(text, env)
    var = expr.strip()
    return env.get(var, "")


def _expand_list(values: Sequence[str], env: Mapping[str, str]) -> list[str]:
    return [item for item in (_expand_string(value, env) for value in values) if item]


def _expand_mapping(
    mapping: Mapping[str, str],
    env: Mapping[str, str],
    *,
    drop_empty: bool = False,
) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in mapping.items():
        expanded = _expand_string(value, env)
        if drop_empty and expanded == "":
            continue
        result[key] = expanded
    return result


def _expand_nested(value: Any, env: Mapping[str, str]) -> Any:
    if isinstance(value, str):
        return _expand_string(value, env)
    if isinstance(value, Mapping):
        return {k: _expand_nested(v, env) for k, v in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_expand_nested(item, env) for item in value]
    return value


class MCPLimits(BaseModel):
    """Rate limits and timeout configuration for MCP server."""

    rate_per_min: int = Field(
        default=60,
        description="Maximum requests per minute",
        gt=0,
    )
    timeout_s: int = Field(
        default=30,
        description="Request timeout in seconds",
        gt=0,
    )


class PostgresConnection(BaseModel):
    """PostgreSQL connection configuration."""

    url_env: str = Field(
        description="Environment variable name containing connection URL",
    )


class TransportDefinition(BaseModel):
    """Transport definition supporting HTTP, SSE, and STDIO."""

    type: Literal["http", "sse", "stdio", "websocket"]
    url: str | None = Field(default=None, description="Remote endpoint URL")
    command: str | None = Field(default=None, description="Executable for stdio transport")
    args: list[str] = Field(default_factory=list, description="Command arguments")
    headers: Dict[str, str] = Field(default_factory=dict, description="HTTP/SSE headers")
    env: Dict[str, str] = Field(default_factory=dict, description="Environment variables for stdio")
    timeout: float | str | None = Field(
        default=None,
        description="Optional timeout override in seconds",
    )

    @model_validator(mode="after")
    def _validate_transport(self) -> "TransportDefinition":
        if self.type in {"http", "sse", "websocket"}:
            if not self.url:
                raise ValueError(f"{self.type} transport requires 'url'")
        if self.type == "stdio" and not self.command:
            raise ValueError("stdio transport requires 'command'")

        env = os.environ
        if self.url:
            self.url = _expand_string(self.url, env)
        if self.command:
            self.command = _expand_string(self.command, env)
        if self.args:
            self.args = _expand_list(self.args, env)
        if self.headers:
            self.headers = _expand_mapping(self.headers, env, drop_empty=True)
        if self.env:
            self.env = _expand_mapping(self.env, env, drop_empty=True)
        if self.timeout is not None and isinstance(self.timeout, str):
            expanded_timeout = _expand_string(self.timeout, env)
            try:
                self.timeout = float(expanded_timeout)
            except ValueError:
                raise ValueError(f"Invalid timeout value '{expanded_timeout}' for transport {self.type}") from None
        return self


class PermissionSettings(BaseModel):
    """Structured permission settings for MCP servers."""

    scope: list[str] = Field(default_factory=list, description="Scopes granted to the connection")
    write_requires_approval: Optional[bool] = Field(
        default=None,
        description="Whether write operations require prior approval",
    )
    tools: Dict[str, str] = Field(
        default_factory=dict,
        description="Per-tool policy overrides (allow/deny/require-approval)",
    )
    extra: Dict[str, Any] = Field(default_factory=dict, description="Unstructured permission metadata")


class MCPServerConfig(BaseModel):
    """Configuration for a single MCP server.

    This model represents the structure of .mcp/servers/*.json artefacts.
    """

    server_id: str = Field(
        description="Unique identifier for the MCP server",
        validation_alias=AliasChoices("server_id", "id"),
    )
    version: str | None = Field(default=None, description="Preset version identifier")
    type: Literal["mcp", "postgres"] | None = Field(
        default=None,
        description="Server type: mcp for protocol servers, postgres for database",
    )
    description: str | None = Field(
        default=None,
        description="Human-readable description of the server",
    )
    notes: str | None = Field(default=None, description="Operational notes for the preset")
    scopes: list[str] = Field(default_factory=list, description="Legacy access scopes")
    limits: MCPLimits = Field(
        default_factory=MCPLimits,
        description="Rate limits and timeout configuration",
    )
    transport: TransportDefinition | None = Field(
        default=None,
        description="Primary transport definition (HTTP preferred)",
    )
    fallback: list[TransportDefinition] = Field(
        default_factory=list,
        description="Ordered list of fallback transport definitions",
    )
    permissions: PermissionSettings = Field(
        default_factory=PermissionSettings,
        description="Structured permission settings",
    )
    options: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional preset options (transport-specific)",
    )

    # PostgreSQL specific fields (type="postgres")
    conn: PostgresConnection | None = Field(
        default=None,
        description="PostgreSQL connection configuration",
    )
    raw: Dict[str, Any] = Field(default_factory=dict, description="Original payload copy")

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }

    @model_validator(mode="before")
    def _normalize_payload(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        normalized = dict(data)
        normalized.setdefault("raw", dict(data))

        if "server_id" not in normalized and "id" in normalized:
            normalized["server_id"] = normalized["id"]

        transport_value = normalized.get("transport")
        if isinstance(transport_value, TransportDefinition):
            normalized["transport"] = transport_value
        elif isinstance(transport_value, dict):
            normalized["transport"] = transport_value
        elif transport_value is not None:
            raise ValueError("transport must be an object describing the primary connection")

        fallback_value = normalized.get("fallback")
        if fallback_value is None:
            normalized["fallback"] = []

        permissions_value = normalized.get("permissions")
        if permissions_value is None:
            permissions_value = {}
        if not permissions_value.get("scope") and normalized.get("scopes"):
            permissions_value["scope"] = normalized["scopes"]
        normalized["permissions"] = permissions_value

        return normalized

    @model_validator(mode="after")
    def _default_type(self) -> "MCPServerConfig":
        if self.type is None:
            if self.conn is not None:
                self.type = "postgres"
            else:
                self.type = "mcp"

        return self

    @model_validator(mode="after")
    def _expand_environment(self) -> "MCPServerConfig":
        env_vars = os.environ

        if self.options:
            self.options = _expand_nested(self.options, env_vars)
        if self.transport:
            transport_data = _expand_nested(
                self.transport.model_dump(exclude_unset=True),
                env_vars,
            )
            self.transport = TransportDefinition.model_validate(transport_data)
        if self.fallback:
            expanded_fallback: list[TransportDefinition] = []
            for entry in self.fallback:
                fallback_data = _expand_nested(
                    entry.model_dump(exclude_unset=True),
                    env_vars,
                )
                expanded_fallback.append(TransportDefinition.model_validate(fallback_data))
            self.fallback = expanded_fallback

        # Expand permissions metadata for completeness
        if self.permissions and self.permissions.extra:
            self.permissions.extra = _expand_nested(self.permissions.extra, env_vars)
        if self.permissions.scope:
            self.permissions.scope = _expand_list(self.permissions.scope, env_vars)

        return self

    def validate_type_fields(self) -> None:
        """Validate that required fields are present based on server type."""
        if self.type == "mcp":
            if not self.transport and not self.fallback:
                raise ValueError(
                    "MCP servers must specify at least one transport definition"
                )
        elif self.type == "postgres":
            if not self.conn:
                raise ValueError("PostgreSQL servers must specify 'conn' field")

    def get_permission_name(self) -> str:
        """Get the permission name for this MCP server.

        Returns:
            Permission name in format "mcp:<server_id>"
        """
        return f"mcp:{self.server_id}"

    def transport_chain(self) -> list[TransportDefinition]:
        """Return ordered transport definitions including fallbacks."""
        if self.type and self.type != "mcp":
            return []

        chain: list[TransportDefinition] = []

        if self.transport is not None:
            chain.append(self.transport)

        for fallback in self.fallback:
            chain.append(fallback)

        return chain
