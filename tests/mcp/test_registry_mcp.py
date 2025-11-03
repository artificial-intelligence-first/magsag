"""Tests for MCP Registry auto-discovery functionality."""

import json
import tempfile
from collections.abc import Generator
from pathlib import Path

import pytest

from magsag.mcp import MCPRegistry, MCPRegistryError, list_local_servers

pytestmark = pytest.mark.slow


class TestMCPRegistryDiscovery:
    """Test cases for MCP server auto-discovery."""

    @pytest.fixture
    def temp_servers_dir(self) -> Generator[Path, None, None]:
        """Create a temporary directory for server configs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)

    @pytest.fixture
    def sample_mcp_config(self) -> dict[str, object]:
        """Sample MCP server configuration."""
        return {
            "server_id": "test-mcp",
            "type": "mcp",
            "description": "Test MCP server",
            "transport": {
                "type": "http",
                "url": "https://example.test/mcp",
            },
            "permissions": {"scope": ["mcp:test-mcp"]},
            "limits": {
                "rate_per_min": 60,
                "timeout_s": 30,
            },
        }

    @pytest.fixture
    def sample_postgres_config(self) -> dict[str, object]:
        """Sample PostgreSQL server configuration."""
        return {
            "server_id": "test-pg",
            "type": "postgres",
            "conn": {
                "url_env": "TEST_PG_URL",
            },
            "permissions": {"scope": ["mcp:test-pg"]},
            "limits": {
                "rate_per_min": 120,
                "timeout_s": 20,
            },
        }

    def test_discover_empty_directory(self, temp_servers_dir: Path) -> None:
        """Test discovery with no server configs."""
        registry = MCPRegistry(servers_dir=temp_servers_dir)
        registry.discover_servers()

        assert registry.list_servers() == []

    def test_discover_single_server(
        self,
        temp_servers_dir: Path,
        sample_mcp_config: dict[str, object],
    ) -> None:
        """Test discovery of a single MCP server."""
        config_file = temp_servers_dir / "test.json"
        config_file.write_text(json.dumps(sample_mcp_config, indent=2) + "\n", encoding="utf-8")

        registry = MCPRegistry(servers_dir=temp_servers_dir)
        registry.discover_servers()

        servers = registry.list_servers()
        assert len(servers) == 1
        assert "test-mcp" in servers

    def test_discover_multiple_servers(
        self,
        temp_servers_dir: Path,
        sample_mcp_config: dict[str, object],
        sample_postgres_config: dict[str, object],
    ) -> None:
        """Test discovery of multiple servers."""
        # Create two config files
        mcp_file = temp_servers_dir / "mcp.json"
        mcp_file.write_text(json.dumps(sample_mcp_config, indent=2) + "\n", encoding="utf-8")

        pg_file = temp_servers_dir / "postgres.json"
        pg_file.write_text(json.dumps(sample_postgres_config, indent=2) + "\n", encoding="utf-8")

        registry = MCPRegistry(servers_dir=temp_servers_dir)
        registry.discover_servers()

        servers = registry.list_servers()
        assert len(servers) == 2
        assert "test-mcp" in servers
        assert "test-pg" in servers

    def test_discover_ignores_non_json_configs(
        self,
        temp_servers_dir: Path,
        sample_mcp_config: dict[str, object],
    ) -> None:
        """Ensure discovery ignores legacy YAML configs."""
        legacy_file = temp_servers_dir / "legacy.yaml"
        legacy_file.write_text(json.dumps(sample_mcp_config, indent=2) + "\n", encoding="utf-8")

        registry = MCPRegistry(servers_dir=temp_servers_dir)
        registry.discover_servers()

        servers = registry.list_servers()
        assert servers == []

    def test_discover_ignores_invalid_configs(
        self,
        temp_servers_dir: Path,
    ) -> None:
        """Test that discovery continues despite invalid configs."""
        # Valid config
        valid_file = temp_servers_dir / "valid.json"
        valid_file.write_text(
            json.dumps(
                {
                    "server_id": "valid",
                    "type": "mcp",
                    "transport": {
                        "type": "http",
                        "url": "https://example.test/api",
                    },
                    "permissions": {"scope": ["mcp:valid"]},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

        # Invalid config (missing required fields)
        invalid_file = temp_servers_dir / "invalid.json"
        invalid_file.write_text(json.dumps({"invalid": "config"}, indent=2) + "\n", encoding="utf-8")

        # Empty config
        empty_file = temp_servers_dir / "empty.json"
        empty_file.write_text("", encoding="utf-8")

        registry = MCPRegistry(servers_dir=temp_servers_dir)
        registry.discover_servers()

        # Should discover only the valid config
        servers = registry.list_servers()
        assert len(servers) == 1
        assert "valid" in servers

    def test_discover_nonexistent_directory(self) -> None:
        """Test discovery with nonexistent directory."""
        registry = MCPRegistry(servers_dir=Path("/nonexistent/path"))
        # Should not raise, just log warning
        registry.discover_servers()
        assert registry.list_servers() == []

    def test_validate_permissions(
        self,
        temp_servers_dir: Path,
        sample_mcp_config: dict[str, object],
    ) -> None:
        """Test permission validation against discovered servers."""
        config_file = temp_servers_dir / "test.json"
        config_file.write_text(json.dumps(sample_mcp_config, indent=2) + "\n", encoding="utf-8")

        registry = MCPRegistry(servers_dir=temp_servers_dir)
        registry.discover_servers()

        # Valid permission
        result = registry.validate_permissions(["mcp:test-mcp"])
        assert result == {"mcp:test-mcp": True}

        # Invalid permission (server doesn't exist)
        result = registry.validate_permissions(["mcp:nonexistent"])
        assert result == {"mcp:nonexistent": False}

        # Mixed permissions
        result = registry.validate_permissions(["mcp:test-mcp", "mcp:nonexistent"])
        assert result == {
            "mcp:test-mcp": True,
            "mcp:nonexistent": False,
        }

        # Invalid format
        result = registry.validate_permissions(["invalid:format"])
        assert result == {"invalid:format": False}


class TestMCPRegistryLifecycle:
    """Test cases for MCP server lifecycle management."""

    @pytest.fixture
    def temp_servers_dir(self) -> Generator[Path, None, None]:
        """Create a temporary directory for server configs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            yield Path(tmpdir)

    @pytest.fixture
    def registry_with_servers(self, temp_servers_dir: Path) -> MCPRegistry:
        """Create a registry with sample server configs."""
        # MCP server config
        mcp_file = temp_servers_dir / "mcp.json"
        mcp_file.write_text(
            json.dumps(
                {
                    "server_id": "test-mcp",
                    "type": "mcp",
                    "transport": {
                        "type": "http",
                        "url": "https://example.test/mcp",
                    },
                    "permissions": {"scope": ["mcp:test-mcp"]},
                },
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

        registry = MCPRegistry(servers_dir=temp_servers_dir)
        registry.discover_servers()
        return registry

    @pytest.mark.asyncio
    async def test_start_unknown_server(
        self,
        registry_with_servers: MCPRegistry,
    ) -> None:
        """Test starting a server that doesn't exist."""
        with pytest.raises(MCPRegistryError, match="not found in registry"):
            await registry_with_servers.start_server("nonexistent")

    @pytest.mark.asyncio
    async def test_stop_nonrunning_server(
        self,
        registry_with_servers: MCPRegistry,
    ) -> None:
        """Test stopping a server that isn't running."""
        # Should not raise, just log
        await registry_with_servers.stop_server("test-mcp")

    def test_list_servers(self, registry_with_servers: MCPRegistry) -> None:
        """Test listing all discovered servers."""
        servers = registry_with_servers.list_servers()
        assert "test-mcp" in servers

    @pytest.mark.asyncio
    async def test_list_running_servers(
        self,
        registry_with_servers: MCPRegistry,
    ) -> None:
        """Test listing only running servers."""
        # Initially no servers running
        assert registry_with_servers.list_running_servers() == []

        # Note: We can't actually start the MCP server in tests
        # without a real MCP server implementation, so we just
        # verify the API works

    def test_get_tools_from_nonexistent_server(
        self,
        registry_with_servers: MCPRegistry,
    ) -> None:
        """Test getting tools from a server that doesn't exist."""
        tools = registry_with_servers.get_tools("nonexistent")
        assert tools == []

    def test_get_tools_from_stopped_server(
        self,
        registry_with_servers: MCPRegistry,
    ) -> None:
        """Test getting tools from a stopped server."""
        tools = registry_with_servers.get_tools("test-mcp")
        assert tools == []  # Server not started yet


@pytest.mark.slow
def test_repository_servers_validate_json_layout() -> None:
    """Ensure repository JSON artefacts remain deterministic and traceable."""
    registry = MCPRegistry()
    registry.discover_servers()

    servers = registry.list_servers()
    assert servers, "Expected generated JSON artefacts under .mcp/servers/"

    for config_path in list_local_servers():
        assert config_path.suffix == ".json"
        payload = json.loads(config_path.read_text(encoding="utf-8"))
        metadata = payload.get("metadata") or {}
        assert metadata.get("source"), f"missing metadata.source in {config_path}"
        assert metadata.get("source_digest"), f"missing metadata.source_digest in {config_path}"
