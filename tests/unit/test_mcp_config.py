from __future__ import annotations

import pytest

from magsag.mcp.config import MCPServerConfig, TransportDefinition


def test_transport_chain_includes_fallbacks() -> None:
    config = MCPServerConfig(
        server_id="notion",
        transport=TransportDefinition(type="http", url="https://example.com"),
        fallback=[
            TransportDefinition(type="sse", url="https://example.com/sse"),
            TransportDefinition(
                type="stdio",
                command="npx",
                args=["-y", "mcp-remote", "https://example.com"],
            ),
        ],
    )

    chain = config.transport_chain()
    assert [item.type for item in chain] == ["http", "sse", "stdio"]


@pytest.mark.parametrize(
    ("env_token", "expected_header", "expected_url"),
    [
        ("abc123", "Bearer abc123", "https://example.com?token=abc123"),
        ("", None, "https://example.com"),
    ],
)
def test_placeholder_expansion_in_transport(monkeypatch: pytest.MonkeyPatch, env_token: str, expected_header: str | None, expected_url: str) -> None:
    if env_token:
        monkeypatch.setenv("TOKEN", env_token)
    else:
        monkeypatch.delenv("TOKEN", raising=False)

    config = MCPServerConfig(
        server_id="example",
        transport=TransportDefinition(
            type="http",
            url="https://example.com${TOKEN:+?token=${TOKEN}}",
            headers={
                "Authorization": "${TOKEN:+Bearer ${TOKEN}}",
            },
        ),
        fallback=[
            TransportDefinition(
                type="stdio",
                command="npx",
                args=["-y", "tool", "${TOKEN}"],
                env={"TOKEN": "${TOKEN}"},
            )
        ],
        options={"read_only": "${TOKEN:-false}"},
    )

    transport = config.transport
    assert transport is not None
    assert transport.url == expected_url
    if expected_header is None:
        assert "Authorization" not in transport.headers
    else:
        assert transport.headers["Authorization"] == expected_header

    # stdio fallback should drop env when unset and keep args populated only with non-empty values
    fallback = config.fallback[0]
    if env_token:
        assert fallback.args == ["-y", "tool", env_token]
        assert fallback.env["TOKEN"] == env_token
        assert config.options["read_only"] == env_token
    else:
        assert fallback.args == ["-y", "tool"]
        assert "TOKEN" not in fallback.env
        assert config.options["read_only"] == "false"


def test_transport_override_preserved_for_websocket() -> None:
    payload = {
        "server_id": "ws-server",
        "transport": "websocket",
        "url": "wss://example.com/socket",
    }
    config = MCPServerConfig.model_validate(payload)

    chain = config.transport_chain()
    assert len(chain) == 1
    transport = chain[0]
    assert transport.type == "websocket"
    assert transport.url == "wss://example.com/socket"


@pytest.mark.parametrize(
    ("env_token", "expected_header", "expected_url"),
    [
        ("abc123", "Bearer abc123", "https://example.com?token=abc123"),
        ("", None, "https://example.com"),
    ],
)
def test_model_validate_expands_transport_placeholders(
    monkeypatch: pytest.MonkeyPatch,
    env_token: str,
    expected_header: str | None,
    expected_url: str,
) -> None:
    if env_token:
        monkeypatch.setenv("TOKEN", env_token)
    else:
        monkeypatch.delenv("TOKEN", raising=False)

    raw_config = {
        "server_id": "example",
        "type": "mcp",
        "transport": {
            "type": "http",
            "url": "https://example.com${TOKEN:+?token=${TOKEN}}",
            "headers": {
                "Authorization": "${TOKEN:+Bearer ${TOKEN}}",
            },
        },
        "fallback": [
            {
                "type": "stdio",
                "command": "npx",
                "args": ["-y", "tool", "${TOKEN}"],
                "env": {"TOKEN": "${TOKEN}"},
            }
        ],
        "options": {"read_only": "${TOKEN:-false}"},
    }

    config = MCPServerConfig.model_validate(raw_config)

    transport = config.transport
    assert transport is not None
    assert transport.url == expected_url
    if expected_header is None:
        assert "Authorization" not in transport.headers
    else:
        assert transport.headers["Authorization"] == expected_header

    fallback = config.fallback[0]
    if env_token:
        assert fallback.args == ["-y", "tool", env_token]
        assert fallback.env["TOKEN"] == env_token
        assert config.options["read_only"] == env_token
    else:
        assert fallback.args == ["-y", "tool"]
        assert "TOKEN" not in fallback.env
        assert config.options["read_only"] == "false"


def test_timeout_placeholder_expansion(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCP_TIMEOUT", "15")
    transport = TransportDefinition(
        type="http",
        url="https://example.com",
        timeout="${MCP_TIMEOUT:-30}",
    )
    assert transport.timeout == 15.0

    raw_config = {
        "server_id": "timeout-test",
        "transport": {
            "type": "http",
            "url": "https://example.com",
            "timeout": "${MCP_TIMEOUT:-30}",
        },
    }
    config = MCPServerConfig.model_validate(raw_config)
    assert config.transport is not None
    assert config.transport.timeout == 15.0

    monkeypatch.delenv("MCP_TIMEOUT", raising=False)
    transport = TransportDefinition(
        type="http",
        url="https://example.com",
        timeout="${MCP_TIMEOUT:-30}",
    )
    assert transport.timeout == 30.0

    config = MCPServerConfig.model_validate(raw_config)
    assert config.transport is not None
    assert config.transport.timeout == 30.0
