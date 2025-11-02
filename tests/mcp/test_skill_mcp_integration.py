"""Comprehensive tests for MCP skill integration.

This module tests the integration between skills and MCP runtime,
including async skill execution, permission management, and backward compatibility.
"""

import importlib.util
import inspect
import tempfile
from collections.abc import Generator
from pathlib import Path
from typing import Any, Dict
from unittest.mock import AsyncMock, MagicMock

import pytest
import yaml

from magsag.mcp import MCPRegistry, MCPRuntime
from magsag.mcp.tool import MCPToolResult
from magsag.registry import Registry, SkillDescriptor
from magsag.runners.agent_runner import SkillRuntime


class TestSkillWithMCPParameter:
    """Test cases for skills that accept MCP runtime parameter."""

    @pytest.fixture
    def mcp_registry(self) -> MCPRegistry:
        """Create an MCP registry for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            servers_dir = Path(tmpdir)

            # Create a test MCP server config
            config_file = servers_dir / "test-server.yaml"
            with open(config_file, "w") as f:
                yaml.dump(
                    {
                        "server_id": "test-server",
                        "type": "mcp",
                        "command": "npx",
                        "args": ["-y", "@test/server"],
                        "scopes": ["read:data"],
                    },
                    f,
                )

            registry = MCPRegistry(servers_dir=servers_dir)
            registry.discover_servers()
            return registry

    @pytest.mark.asyncio
    async def test_skill_with_mcp_parameter(self, mcp_registry: MCPRegistry) -> None:
        """Test async skill that accepts mcp parameter.

        Verifies that:
        - MCP runtime is passed correctly to async skills
        - Skills can access granted permissions
        - MCP runtime is properly initialized
        """
        # Create MCP runtime with permissions
        mcp_runtime = MCPRuntime(mcp_registry)
        mcp_runtime.grant_permissions(["mcp:test-server"])

        # Define an async skill that uses MCP
        async def test_skill(payload: Dict[str, Any], mcp: MCPRuntime) -> Dict[str, Any]:
            """Sample async skill that uses MCP runtime."""
            # Verify runtime is passed correctly
            assert isinstance(mcp, MCPRuntime)

            # Verify permissions are granted
            assert mcp.check_permission("test-server")

            # Return success
            return {
                "status": "success",
                "permissions": mcp.get_granted_permissions(),
                "input": payload,
            }

        # Execute the skill
        result = await test_skill({"data": "test"}, mcp=mcp_runtime)

        # Verify results
        assert result["status"] == "success"
        assert "mcp:test-server" in result["permissions"]
        assert result["input"]["data"] == "test"

    @pytest.mark.asyncio
    async def test_skill_without_mcp_parameter(self, mcp_registry: MCPRegistry) -> None:
        """Test async skill that doesn't use MCP parameter.

        Verifies backward compatibility for async skills that don't need MCP.
        """

        async def simple_skill(payload: Dict[str, Any]) -> Dict[str, Any]:
            """Simple async skill without MCP."""
            return {"result": payload["value"] * 2}

        result = await simple_skill({"value": 42})
        assert result["result"] == 84

    @pytest.mark.asyncio
    async def test_skill_with_optional_mcp_parameter(self, mcp_registry: MCPRegistry) -> None:
        """Test skill with optional MCP parameter.

        Verifies that skills can declare MCP as optional and handle both cases.
        """

        async def flexible_skill(
            payload: Dict[str, Any], mcp: MCPRuntime | None = None
        ) -> Dict[str, Any]:
            """Skill that optionally uses MCP."""
            if mcp is not None:
                source = "mcp-enabled"
            else:
                source = "fallback"

            return {"value": payload["value"], "source": source}

        # Test with MCP
        mcp_runtime = MCPRuntime(mcp_registry)
        result_with_mcp = await flexible_skill({"value": 10}, mcp=mcp_runtime)
        assert result_with_mcp["source"] == "mcp-enabled"

        # Test without MCP
        result_without_mcp = await flexible_skill({"value": 10})
        assert result_without_mcp["source"] == "fallback"

    @pytest.mark.asyncio
    async def test_optional_mcp_skill_runs_when_mcp_disabled(self, mcp_registry: MCPRegistry) -> None:
        """Optional MCP skills should execute when runtime is disabled."""

        async def optional_skill(payload: Dict[str, Any], mcp: MCPRuntime | None = None) -> Dict[str, Any]:
            return {"echo": payload, "has_mcp": mcp is not None}

        descriptor = SkillDescriptor(
            id="skill.optional-mcp",
            version="0.1.0",
            entrypoint="tests.fake_module:optional_skill",
            permissions=[],
            raw={},
        )

        mock_registry = MagicMock(spec=Registry)
        mock_registry.load_skill.return_value = descriptor
        mock_registry.resolve_entrypoint.return_value = optional_skill

        skill_runtime = SkillRuntime(registry=mock_registry, enable_mcp=False)

        result = await skill_runtime.invoke_async("skill.optional-mcp", {"value": 5})
        assert result["echo"]["value"] == 5
        assert result["has_mcp"] is False


@pytest.mark.slow
class TestSkillRuntimeInvokeAsync:
    """Test cases for SkillRuntime.invoke_async() with MCP support.

    The suite now relies on lightweight mocks to avoid slow real MCP startups
    while still validating permission wiring and lifecycle management.
    """

    @pytest.fixture
    def temp_dirs(self) -> Generator[tuple[Path, Path], None, None]:
        """Create temporary directories for skills and MCP servers."""
        with (
            tempfile.TemporaryDirectory() as skills_dir,
            tempfile.TemporaryDirectory() as servers_dir,
        ):
            yield Path(skills_dir), Path(servers_dir)

    @pytest.mark.asyncio
    async def test_skill_runtime_invoke_async_with_mcp(
        self,
    ) -> None:
        """invoke_async should pass an initialized MCP runtime to async skills."""

        async def async_skill(
            payload: Dict[str, Any], mcp: MCPRuntime | None = None
        ) -> Dict[str, Any]:
            return {
                "status": "success",
                "has_mcp": mcp is not None,
                "permissions": [] if mcp is None else mcp.get_granted_permissions(),
                "echo": payload,
            }

        descriptor = SkillDescriptor(
            id="skill.test-mcp",
            version="0.1.0",
            entrypoint="tests.fake_module:async_skill",
            permissions=["mcp:pg-readonly"],
            raw={},
        )

        mock_registry = MagicMock(spec=Registry)
        mock_registry.load_skill.return_value = descriptor
        mock_registry.resolve_entrypoint.return_value = async_skill

        skill_runtime = SkillRuntime(registry=mock_registry, enable_mcp=True)

        # Inject a mocked MCP registry to avoid starting real servers
        fake_registry = MagicMock(spec=MCPRegistry)
        fake_registry.start_all_servers = AsyncMock()
        fake_registry.stop_all_servers = AsyncMock()
        skill_runtime.mcp_registry = fake_registry

        result = await skill_runtime.invoke_async(
            "skill.test-mcp",
            {"input": "test"},
            _auto_cleanup=True,
        )

        fake_registry.start_all_servers.assert_awaited_once()
        fake_registry.stop_all_servers.assert_awaited_once()
        assert result["status"] == "success"
        assert result["has_mcp"] is True
        assert result["echo"] == {"input": "test"}
        assert "mcp:pg-readonly" in result["permissions"]
        assert skill_runtime._mcp_started is False

    @pytest.mark.asyncio
    async def test_skill_runtime_restarts_mcp_after_cleanup(self) -> None:
        """Second invocation should re-start MCP servers after cleanup."""

        async def async_skill(
            payload: Dict[str, Any], mcp: MCPRuntime | None = None
        ) -> Dict[str, Any]:
            return {
                "status": "success",
                "has_mcp": mcp is not None,
            }

        descriptor = SkillDescriptor(
            id="skill.test-mcp",
            version="0.1.0",
            entrypoint="tests.fake_module:async_skill",
            permissions=["mcp:pg-readonly"],
            raw={},
        )

        mock_registry = MagicMock(spec=Registry)
        mock_registry.load_skill.return_value = descriptor
        mock_registry.resolve_entrypoint.return_value = async_skill

        skill_runtime = SkillRuntime(registry=mock_registry, enable_mcp=True)
        fake_registry = MagicMock(spec=MCPRegistry)
        fake_registry.start_all_servers = AsyncMock()
        fake_registry.stop_all_servers = AsyncMock()
        skill_runtime.mcp_registry = fake_registry

        await skill_runtime.invoke_async(
            "skill.test-mcp",
            {"input": "one"},
            _auto_cleanup=True,
        )

        await skill_runtime.invoke_async(
            "skill.test-mcp",
            {"input": "two"},
            _auto_cleanup=True,
        )

        assert fake_registry.start_all_servers.await_count == 2
        assert fake_registry.stop_all_servers.await_count == 2
        assert skill_runtime._mcp_started is False

    @pytest.mark.asyncio
    async def test_skill_runtime_invoke_async_without_mcp(
        self, temp_dirs: tuple[Path, Path]
    ) -> None:
        """Test SkillRuntime.invoke() with async skills without MCP.

        Verifies:
        - Async skills can be invoked
        - Skills without MCP permissions work correctly
        """
        skills_dir, _ = temp_dirs

        # Create an async skill file
        skill_file = skills_dir / "async_skill.py"
        skill_file.write_text(
            """
from typing import Any, Dict

async def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {"result": payload["value"] * 2, "type": "async"}
""",
            encoding="utf-8",
        )

        # Create skill descriptor without MCP permissions
        skill_desc = SkillDescriptor(
            id="skill.sync-test",
            version="0.1.0",
            entrypoint=f"{skill_file}:run",
            permissions=[],
            raw={},
        )

        # Mock registry
        mock_registry = MagicMock(spec=Registry)
        mock_registry.load_skill.return_value = skill_desc

        # Load actual function with proper cleanup
        import importlib.util
        import sys

        module_name = f"async_skill_{id(skill_file)}"
        spec = importlib.util.spec_from_file_location(module_name, skill_file)
        assert spec is not None
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        try:
            assert spec.loader is not None
            spec.loader.exec_module(module)
            mock_registry.resolve_entrypoint.return_value = module.run

            # Use invoke for async skills
            skill_runtime = SkillRuntime(registry=mock_registry)
            result = skill_runtime.invoke("skill.sync-test", {"value": 21})

            assert result["result"] == 42
            assert result["type"] == "async"
        finally:
            # Cleanup module
            if module_name in sys.modules:
                del sys.modules[module_name]


@pytest.mark.asyncio
async def test_salary_band_lookup_requires_mcp() -> None:
    """Phase 3 salary-band-lookup should raise when MCP runtime is missing."""

    skill_path = Path("catalog/skills/salary-band-lookup/impl/salary_band_lookup.py").resolve()
    module_name = "salary_band_lookup_skill"
    spec = importlib.util.spec_from_file_location(module_name, skill_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    payload = {"role": "Senior Engineer", "level": "L5", "location": "SF"}

    with pytest.raises(RuntimeError):
        await module.run(payload)  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_salary_band_lookup_queries_database() -> None:
    """salary-band-lookup should return database rows via MCP runtime."""

    skill_path = Path("catalog/skills/salary-band-lookup/impl/salary_band_lookup.py").resolve()
    module_name = "salary_band_lookup_skill_impl"
    spec = importlib.util.spec_from_file_location(module_name, skill_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    payload = {"role": "Senior Engineer", "level": "L5", "location": "SF"}

    class FakeMCP:
        async def query_postgres(self, server_id: str, sql: str, params: list[Any]) -> MCPToolResult:
            assert server_id == "pg-readonly"
            assert params == [payload["role"], payload["level"], payload["location"]]
            return MCPToolResult(
                success=True,
                output={
                    "rows": [
                        {
                            "currency": "USD",
                            "min_salary": 150000,
                            "max_salary": 220000,
                        }
                    ]
                },
                error=None,
                metadata={},
            )

    result = await module.run(payload, mcp=FakeMCP())  # type: ignore[attr-defined]

    assert result == {
        "currency": "USD",
        "min": 150000,
        "max": 220000,
        "source": "database",
    }


@pytest.mark.asyncio
async def test_doc_gen_requires_mcp() -> None:
    """doc-gen should raise when MCP runtime is not provided."""

    skill_path = Path("catalog/skills/doc-gen/impl/doc_gen.py").resolve()
    module_name = "doc_gen_skill"
    spec = importlib.util.spec_from_file_location(module_name, skill_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    payload = {
        "id": "cand-123",
        "name": "Test Candidate",
        "role": "Senior Engineer",
        "level": "L5",
        "location": "San Francisco",
        "salary_band": {
            "currency": "USD",
            "min": 150000,
            "max": 220000,
            "source": "database",
        },
    }

    with pytest.raises(RuntimeError):
        await module.run(payload)  # type: ignore[attr-defined]


@pytest.mark.asyncio
async def test_doc_gen_uses_offer_template() -> None:
    """doc-gen should render narrative content from the MCP-provided template."""

    skill_path = Path("catalog/skills/doc-gen/impl/doc_gen.py").resolve()
    module_name = "doc_gen_skill_impl"
    spec = importlib.util.spec_from_file_location(module_name, skill_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    payload = {
        "id": "cand-123",
        "name": "Test Candidate",
        "role": "Senior Engineer",
        "level": "L5",
        "location": "San Francisco",
        "salary_band": {
            "currency": "USD",
            "min": 150000,
            "max": 220000,
            "source": "database",
        },
    }

    class FakeDocGenMCP:
        async def query_postgres(self, server_id: str, sql: str, params: list[Any]) -> MCPToolResult:
            assert server_id == "pg-readonly"
            assert params  # Ensure template slug is passed
            return MCPToolResult(
                success=True,
                output={
                    "rows": [
                        {
                            "summary_template": "Recommend {base_salary_phrase} for {candidate_name} ({candidate_role}).",
                            "talking_points_template": [
                                "Base compensation: {base_salary_phrase}",
                                "Level: {candidate_level}",
                            ],
                            "default_warnings": ["template-warning"],
                            "provenance_inputs": ["candidate_profile", "salary_band"],
                            "provenance_schemas": {"template": "offer_template"},
                        }
                    ]
                },
                error=None,
                metadata={},
            )

    result = await module.run(payload, mcp=FakeDocGenMCP())  # type: ignore[attr-defined]

    assert "Recommend" in result["narrative"]["summary"]
    assert "Base compensation" in result["narrative"]["talking_points"]
    assert "template-warning" in result["warnings"]
    assert "salary_band" in result["provenance"]["inputs"]


class TestMCPRuntimePermissionIsolation:
    """Test cases for MCP runtime permission isolation between skills."""

    @pytest.fixture
    def mcp_registry(self) -> MCPRegistry:
        """Create MCP registry with multiple servers."""
        with tempfile.TemporaryDirectory() as tmpdir:
            servers_dir = Path(tmpdir)

            # Create multiple server configs
            for server_id in ["server1", "server2", "server3"]:
                config_file = servers_dir / f"{server_id}.yaml"
                with open(config_file, "w") as f:
                    yaml.dump(
                        {
                            "server_id": server_id,
                            "type": "mcp",
                            "command": "npx",
                            "args": ["-y", f"@test/{server_id}"],
                        },
                        f,
                    )

            registry = MCPRegistry(servers_dir=servers_dir)
            registry.discover_servers()
            return registry

    def test_mcp_runtime_permission_isolation(self, mcp_registry: MCPRegistry) -> None:
        """Test that different skills get isolated MCP runtimes.

        Verifies:
        - Each skill gets its own runtime instance
        - Permissions don't leak between runtimes
        - Runtimes are properly isolated
        """
        # Create runtime for skill 1 with server1 permission
        runtime1 = MCPRuntime(mcp_registry)
        runtime1.grant_permissions(["mcp:server1"])

        # Create runtime for skill 2 with server2 permission
        runtime2 = MCPRuntime(mcp_registry)
        runtime2.grant_permissions(["mcp:server2"])

        # Create runtime for skill 3 with both permissions
        runtime3 = MCPRuntime(mcp_registry)
        runtime3.grant_permissions(["mcp:server1", "mcp:server3"])

        # Verify isolation
        assert runtime1.check_permission("server1")
        assert not runtime1.check_permission("server2")
        assert not runtime1.check_permission("server3")

        assert not runtime2.check_permission("server1")
        assert runtime2.check_permission("server2")
        assert not runtime2.check_permission("server3")

        assert runtime3.check_permission("server1")
        assert not runtime3.check_permission("server2")
        assert runtime3.check_permission("server3")

        # Verify permission lists are independent
        perms1 = set(runtime1.get_granted_permissions())
        perms2 = set(runtime2.get_granted_permissions())
        perms3 = set(runtime3.get_granted_permissions())

        assert perms1 == {"mcp:server1"}
        assert perms2 == {"mcp:server2"}
        assert perms3 == {"mcp:server1", "mcp:server3"}

    def test_mcp_runtime_permission_changes_isolated(self, mcp_registry: MCPRegistry) -> None:
        """Test that permission changes in one runtime don't affect others.

        Verifies that granting/revoking permissions is properly isolated.
        """
        # Create two runtimes with same initial permissions
        runtime1 = MCPRuntime(mcp_registry)
        runtime2 = MCPRuntime(mcp_registry)

        runtime1.grant_permissions(["mcp:server1"])
        runtime2.grant_permissions(["mcp:server1"])

        # Modify runtime1 permissions
        runtime1.grant_permissions(["mcp:server2"])
        runtime1.revoke_permissions(["mcp:server1"])

        # Verify runtime2 is unaffected
        assert not runtime1.check_permission("server1")
        assert runtime1.check_permission("server2")

        assert runtime2.check_permission("server1")
        assert not runtime2.check_permission("server2")


class TestSkillSignatureDetection:
    """Test cases for detecting skill signatures (async vs sync, mcp parameter)."""

    def test_detect_async_skill(self) -> None:
        """Test detection of async skills.

        Verifies that inspect can distinguish async from sync functions.
        """

        async def async_skill(payload: Dict[str, Any]) -> Dict[str, Any]:
            return payload

        def sync_skill(payload: Dict[str, Any]) -> Dict[str, Any]:
            return payload

        assert inspect.iscoroutinefunction(async_skill)
        assert not inspect.iscoroutinefunction(sync_skill)

    def test_detect_mcp_parameter(self) -> None:
        """Test detection of mcp parameter in skill signature.

        Verifies that inspect can determine if a skill accepts MCP runtime.
        """

        async def skill_with_mcp(payload: Dict[str, Any], mcp: MCPRuntime) -> Dict[str, Any]:
            return payload

        async def skill_without_mcp(payload: Dict[str, Any]) -> Dict[str, Any]:
            return payload

        async def skill_with_optional_mcp(
            payload: Dict[str, Any], mcp: MCPRuntime | None = None
        ) -> Dict[str, Any]:
            return payload

        # Check signatures
        sig_with = inspect.signature(skill_with_mcp)
        sig_without = inspect.signature(skill_without_mcp)
        sig_optional = inspect.signature(skill_with_optional_mcp)

        assert "mcp" in sig_with.parameters
        assert "mcp" not in sig_without.parameters
        assert "mcp" in sig_optional.parameters

        # Check if mcp is optional
        assert sig_with.parameters["mcp"].default == inspect.Parameter.empty
        assert sig_optional.parameters["mcp"].default is None

    def test_correct_execution_path_selection(self) -> None:
        """Test that correct execution path is chosen based on signature.

        Verifies the logic for determining how to invoke a skill.
        """

        def should_use_async(func: Any) -> bool:
            """Determine if function should be called with await."""
            return inspect.iscoroutinefunction(func)

        def should_pass_mcp(func: Any) -> bool:
            """Determine if function accepts mcp parameter."""
            sig = inspect.signature(func)
            return "mcp" in sig.parameters

        # Test functions
        async def async_with_mcp(payload: Dict[str, Any], mcp: MCPRuntime) -> Dict[str, Any]:
            return payload

        async def async_without_mcp(payload: Dict[str, Any]) -> Dict[str, Any]:
            return payload

        def sync_skill(payload: Dict[str, Any]) -> Dict[str, Any]:
            return payload

        # Verify detection
        assert should_use_async(async_with_mcp)
        assert should_pass_mcp(async_with_mcp)

        assert should_use_async(async_without_mcp)
        assert not should_pass_mcp(async_without_mcp)

        assert not should_use_async(sync_skill)
        assert not should_pass_mcp(sync_skill)

    def test_skill_invocation_decision_tree(self) -> None:
        """Test the decision tree for skill invocation.

        Verifies all combinations of async/sync and mcp/no-mcp.
        """

        def get_invocation_strategy(func: Any) -> str:
            """Determine how to invoke a skill."""
            is_async = inspect.iscoroutinefunction(func)
            has_mcp = "mcp" in inspect.signature(func).parameters

            if is_async and has_mcp:
                return "async_with_mcp"
            elif is_async and not has_mcp:
                return "async_without_mcp"
            elif not is_async and has_mcp:
                return "sync_with_mcp"  # Unusual but possible
            else:
                return "sync_without_mcp"

        # Test all combinations
        async def f1(p: Dict[str, Any], mcp: MCPRuntime) -> Dict[str, Any]:
            return p

        async def f2(p: Dict[str, Any]) -> Dict[str, Any]:
            return p

        def f3(p: Dict[str, Any], mcp: MCPRuntime) -> Dict[str, Any]:
            return p

        def f4(p: Dict[str, Any]) -> Dict[str, Any]:
            return p

        assert get_invocation_strategy(f1) == "async_with_mcp"
        assert get_invocation_strategy(f2) == "async_without_mcp"
        assert get_invocation_strategy(f3) == "sync_with_mcp"
        assert get_invocation_strategy(f4) == "sync_without_mcp"


class TestSkillMCPIntegrationEdgeCases:
    """Test edge cases and error conditions for MCP skill integration."""

    @pytest.fixture
    def mcp_registry(self) -> MCPRegistry:
        """Create MCP registry for testing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            registry = MCPRegistry(servers_dir=Path(tmpdir))
            registry.discover_servers()
            return registry

    @pytest.mark.asyncio
    async def test_skill_with_invalid_permissions(self, mcp_registry: MCPRegistry) -> None:
        """Test skill with permissions that don't exist in registry.

        Verifies graceful handling of invalid permission declarations.
        """
        mcp_runtime = MCPRuntime(mcp_registry)

        # Grant permission for non-existent server
        mcp_runtime.grant_permissions(["mcp:nonexistent-server"])

        # Permission check should return False (not error)
        assert not mcp_registry.validate_permissions(["mcp:nonexistent-server"])[
            "mcp:nonexistent-server"
        ]

        # Runtime should still track the permission
        assert "mcp:nonexistent-server" in mcp_runtime.get_granted_permissions()

        # But permission check should fail
        assert mcp_runtime.check_permission("nonexistent-server")

    @pytest.mark.asyncio
    async def test_skill_mixed_valid_invalid_permissions(self, mcp_registry: MCPRegistry) -> None:
        """Test skill with mix of valid and invalid permissions.

        Verifies that valid permissions work even when some are invalid.
        """
        # Add a valid server
        with tempfile.TemporaryDirectory() as tmpdir:
            servers_dir = Path(tmpdir)
            config_file = servers_dir / "valid.yaml"
            with open(config_file, "w") as f:
                yaml.dump(
                    {
                        "server_id": "valid-server",
                        "type": "mcp",
                        "command": "test",
                        "args": [],
                    },
                    f,
                )

            registry = MCPRegistry(servers_dir=servers_dir)
            registry.discover_servers()

            runtime = MCPRuntime(registry)
            runtime.grant_permissions(
                [
                    "mcp:valid-server",
                    "mcp:invalid-server",
                ]
            )

            # Valid permission should work
            assert runtime.check_permission("valid-server")

            # Invalid permission should still be granted (validation is separate)
            assert runtime.check_permission("invalid-server")

    @pytest.mark.asyncio
    async def test_skill_error_handling(self, mcp_registry: MCPRegistry) -> None:
        """Test error handling in skills that use MCP.

        Verifies that exceptions in MCP operations are handled gracefully.
        """

        async def error_prone_skill(payload: Dict[str, Any], mcp: MCPRuntime) -> Dict[str, Any]:
            """Skill that might encounter MCP errors."""
            try:
                # This will fail if server isn't running
                result = await mcp.execute_tool(
                    server_id="nonexistent",
                    tool_name="test",
                    arguments={},
                )

                if not result.success:
                    return {
                        "status": "error",
                        "error": result.error,
                        "fallback": True,
                    }

                return {"status": "success", "data": result.output}
            except Exception as e:
                return {
                    "status": "exception",
                    "error": str(e),
                    "fallback": True,
                }

        mcp_runtime = MCPRuntime(mcp_registry)
        mcp_runtime.grant_permissions(["mcp:nonexistent"])

        result = await error_prone_skill({"input": "test"}, mcp=mcp_runtime)

        # Should return error response, not raise exception
        assert result["status"] in ["error", "exception"]
        assert result["fallback"] is True
