from typing import Any

import pytest

from magsag.runners.agent_runner import AgentRunner, Result


def test_offer_orchestrator_generates_deterministic_offer() -> None:
    runner = AgentRunner()
    payload = {
        "role": "Senior Engineer",
        "level": "Senior",
        "location": "San Francisco, CA",
        "experience_years": 8,
    }

    output = runner.invoke_mag("offer-orchestrator-mag", payload)

    assert output["mag"] == "offer-orchestrator-mag"
    assert output["metadata"]["generated_by"] == "OfferOrchestratorMAG"
    assert output["metadata"]["task_count"] == 1
    assert output["metadata"]["successful_tasks"] == 1

    offer = output["offer"]
    assert offer["role"] == "Senior Engineer"
    assert offer["base_salary"]["amount"] > 150000
    assert offer["band"]["min"] <= offer["base_salary"]["amount"] <= offer["band"]["max"]

    first_task = output["results"][0]
    assert first_task["output"]["metadata"]["agent"] == "compensation-advisor-sag"
    assert first_task["output"]["analysis"]["transform"]["source"] == "skill.test-helper-transform"


def test_offer_orchestrator_uses_runner_run_id() -> None:
    runner = AgentRunner()
    context: dict[str, str] = {"marker": "keep"}

    output = runner.invoke_mag(
        "offer-orchestrator-mag",
        {"role": "Engineer", "level": "Mid"},
        context=context,
    )

    assert "run_id" in context
    assert output["metadata"]["run_id"] == context["run_id"]


def test_offer_orchestrator_raises_when_all_delegations_fail(monkeypatch: pytest.MonkeyPatch) -> None:
    runner = AgentRunner()

    async def fake_invoke_sag_async(delegation: Any) -> Result:
        return Result(
            task_id=delegation.task_id,
            status="failure",
            output={},
            metrics={},
            error="forced failure",
        )

    monkeypatch.setattr(runner, "invoke_sag_async", fake_invoke_sag_async)

    with pytest.raises(RuntimeError, match="All delegations failed"):
        runner.invoke_mag("offer-orchestrator-mag", {"role": "Test", "level": "Mid"})


def test_offer_orchestrator_propagates_parent_run_id() -> None:
    runner = AgentRunner()
    context: dict[str, str] = {"marker": "keep"}

    output = runner.invoke_mag(
        "offer-orchestrator-mag",
        {"role": "Engineer", "level": "Mid", "experience_years": 2},
        context=context,
    )

    first_result = output["results"][0]
    assert first_result["status"] == "success"
    assert first_result["output"]["metadata"]["agent"] == "compensation-advisor-sag"
    assert first_result["output"]["metadata"]["observability_enabled"]
