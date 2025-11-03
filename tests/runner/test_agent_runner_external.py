from typing import Any, Dict, cast

import pytest

from magsag.core.permissions import ToolPermission
from magsag.runners.agent_runner import AgentRunner


class DummyExternalTool:
    def __init__(self) -> None:
        self.calls: list[Dict[str, Any]] = []

    async def __call__(self, **kwargs: Any) -> Dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "status": "success",
            "target": kwargs["target"],
            "skill": kwargs["skill_name"],
            "output": {},
            "metadata": {},
        }


@pytest.mark.asyncio
async def test_delegate_external_sync_rejected_inside_event_loop() -> None:
    runner = AgentRunner()

    with pytest.raises(RuntimeError, match="delegate_external\\(\\) cannot be called"):
        runner.delegate_external(
            target="claude",
            skill_name="system.echo",
            payload={},
        )


class StubBudgetController:
    def __init__(self) -> None:
        self.ensure_calls: list[tuple[str, int]] = []
        self.record_calls: list[tuple[str, int]] = []

    def ensure_within_budget(self, provider: str, projected_cents: int) -> None:
        self.ensure_calls.append((provider, projected_cents))

    def record_spend(
        self,
        provider: str,
        cost_cents: int,
        *,
        metadata: Dict[str, Any] | None = None,
    ) -> None:
        if cost_cents <= 0:
            return
        self.record_calls.append((provider, cost_cents))


@pytest.mark.asyncio
async def test_delegate_external_async_budget_zero_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    runner = AgentRunner()
    dummy_tool = DummyExternalTool()
    stub_budget = StubBudgetController()

    monkeypatch.setattr(runner, "_get_external_handoff_tool", lambda: dummy_tool)
    runner.budget_controller = cast(Any, stub_budget)

    result = await runner.delegate_external_async(
        target="claude",
        skill_name="system.echo",
        payload={},
        budget_cents=0,
    )

    assert result["target"] == "claude"
    assert stub_budget.ensure_calls == [("claude", 0)]
    assert stub_budget.record_calls == []


@pytest.mark.asyncio
async def test_delegate_external_auto_resolves_codex(monkeypatch: pytest.MonkeyPatch) -> None:
    runner = AgentRunner()
    dummy_tool = DummyExternalTool()
    monkeypatch.setattr(runner, "_get_external_handoff_tool", lambda: dummy_tool)

    result = await runner.delegate_external_async(
        target=None,
        skill_name="code.exec",
        payload={},
        capabilities_required=["cloud_coding_agent"],
    )

    assert result["target"] == "codex"
    assert dummy_tool.calls[0]["target"] == "codex"


@pytest.mark.asyncio
async def test_delegate_external_auto_resolves_from_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    runner = AgentRunner()
    dummy_tool = DummyExternalTool()
    monkeypatch.setattr(runner, "_get_external_handoff_tool", lambda: dummy_tool)

    result = await runner.delegate_external_async(
        target="auto",
        skill_name="fs.scan",
        payload={},
        metadata={"capabilities_required": ["fs"]},
    )

    assert result["target"] == "claude"
    assert dummy_tool.calls[0]["target"] == "claude"


class RecordingApprovalGate:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Dict[str, Any]]] = []

    def evaluate(self, tool_name: str, context: Dict[str, Any]) -> ToolPermission:
        self.calls.append((tool_name, context))
        return ToolPermission.ALWAYS


def test_enforce_external_approval_risk_case_insensitive() -> None:
    runner = AgentRunner()
    gate = RecordingApprovalGate()
    runner.approval_gate = cast(Any, gate)

    runner._enforce_external_approval(
        target="codex",
        skill_name="system.echo",
        audit_tags={"risk": "HIGH"},
        metadata={},
        trace_id="trace-123",
    )

    assert gate.calls
    tool_name, context = gate.calls[0]
    assert tool_name == "external.codex.system.echo"
    assert context["audit_tags"]["risk"] == "HIGH"
