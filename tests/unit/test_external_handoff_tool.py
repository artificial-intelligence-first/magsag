from magsag.sdks.base import ExternalDispatcherRegistry
from magsag.sdks.openai_agents.external_handoff import ExternalHandoffTool


def test_external_handoff_tool_registers_default_dispatchers() -> None:
    registry = ExternalDispatcherRegistry()
    ExternalHandoffTool(registry=registry)

    targets = set(registry.list_targets())
    assert {"claude", "codex"}.issubset(targets)
