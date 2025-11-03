"""Pytest configuration helpers."""

from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from typing import Iterator

import pytest


@pytest.fixture(autouse=True)
def reset_engine_caches() -> Iterator[None]:
    """Clear engine configuration caches between tests."""
    from magsag import settings

    settings.get_engine_settings.cache_clear()
    settings._resolve_engine_config_cached.cache_clear()
    try:
        yield
    finally:
        settings.get_engine_settings.cache_clear()
        settings._resolve_engine_config_cached.cache_clear()


@pytest.fixture(autouse=True)
def reset_observability_metrics() -> Iterator[None]:
    from magsag.observability.metrics import reset_metrics

    reset_metrics()
    try:
        yield
    finally:
        reset_metrics()


# Project-wide initialization: strip tests/ from sys.path and reset MCP modules
def _strip_tests_from_sys_path() -> None:
    """Remove tests directory from sys.path to avoid import conflicts."""
    tests_dir = Path(__file__).resolve().parent
    for idx, entry in reversed(list(enumerate(sys.path))):
        if not entry:
            continue
        try:
            resolved = Path(entry).resolve()
        except Exception:
            continue
        if resolved == tests_dir:
            sys.path.pop(idx)


def _reset_mcp_modules() -> None:
    """Reset MCP modules to ensure clean state."""
    for key in list(sys.modules):
        if key == "mcp" or key.startswith("mcp."):
            sys.modules.pop(key, None)


# Execute initialization on import
_strip_tests_from_sys_path()
_reset_mcp_modules()


@pytest.fixture(scope="session", autouse=True)
def disable_mcp_for_tests() -> Iterator[None]:
    """Disable MCP integrations during tests unless explicitly re-enabled.

    Heavyweight MCP servers (e.g. npx-based helpers) slow down or hang
    parallel test workers. Setting ``MAGSAG_ENABLE_MCP=0`` keeps the default
    agent runner lightweight while individual tests can override it.
    """

    previous = os.getenv("MAGSAG_ENABLE_MCP")
    os.environ["MAGSAG_ENABLE_MCP"] = "0"

    # Ensure magsag.mcp exports server provider helpers even with MCP disabled.
    try:
        mcp_module = importlib.import_module("magsag.mcp")
        if not getattr(mcp_module, "HAS_SERVER_PROVIDER", False):
            server_provider = importlib.import_module("magsag.mcp.server_provider")
            setattr(mcp_module, "MAGSAGMCPServer", getattr(server_provider, "MAGSAGMCPServer", None))
            setattr(mcp_module, "create_server", getattr(server_provider, "create_server", None))
            setattr(
                mcp_module,
                "HAS_SERVER_PROVIDER",
                bool(getattr(server_provider, "HAS_MCP_SDK", False)),
            )
    except ImportError:
        # If MCP modules are unavailable the slow MCP tests will skip as expected.
        pass
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("MAGSAG_ENABLE_MCP", None)
        else:
            os.environ["MAGSAG_ENABLE_MCP"] = previous


def pytest_addoption(parser: pytest.Parser) -> None:
    """Register custom CLI options."""
    parser.addoption(
        "--run-slow",
        action="store_true",
        default=False,
        help="Run tests marked as slow (defaults to skipping them).",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip slow tests unless explicitly enabled."""
    if config.getoption("--run-slow"):
        return

    mark_expr = getattr(config.option, "markexpr", "") or ""
    if "slow" in mark_expr:
        return

    skip_slow = pytest.mark.skip(reason="slow tests require --run-slow or -m slow")
    for item in items:
        if "slow" in item.keywords:
            item.add_marker(skip_slow)
