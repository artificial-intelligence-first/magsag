from __future__ import annotations

import pytest

from magsag.planner.planner import Planner
from magsag.routing.router import Plan
from magsag.core.types import PlanIR


def test_planner_returns_plan_ir(monkeypatch: pytest.MonkeyPatch) -> None:
    sample_plan = Plan(
        task_type="demo-task",
        provider="openai",
        model="gpt-4o-mini",
        use_batch=False,
        use_cache=False,
        structured_output=False,
        moderation=False,
        metadata={},
    )

    monkeypatch.setattr(
        "magsag.planner.planner.get_plan",
        lambda task_type, overrides=None, policy=None: sample_plan,
    )

    planner = Planner()
    plan_ir = planner.plan("demo-task")

    assert plan_ir is not None
    assert isinstance(plan_ir, PlanIR)
    assert plan_ir.goal == "demo-task"
    assert plan_ir.steps
    assert plan_ir.steps[0].role == "MAG"
