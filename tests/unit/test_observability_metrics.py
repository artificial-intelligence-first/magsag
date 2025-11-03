from __future__ import annotations

from pathlib import Path

import pytest

from magsag.agent.spec import EngineExecutionResult, RunOutcome, RunSpec
from magsag.observability.metrics import MetricsRegistry


def test_metrics_registry_records_run_duration(tmp_path: Path) -> None:
    spec = RunSpec(
        prompt="Check metrics",
        repo_root=tmp_path,
        mode="subscription",
        engine_mag="codex-cli",
        engine_sag="claude-cli",
    )

    mag_result = EngineExecutionResult(
        engine="codex-cli",
        role="mag",
        prompt=spec.prompt,
        returncode=0,
        duration_ms=200.0,
        events=[{"event": "mag"}],
        stdout="",
        stderr="",
    )

    sag_result = EngineExecutionResult(
        engine="claude-cli",
        role="sag",
        prompt=spec.prompt,
        returncode=0,
        duration_ms=250.0,
        events=[{"event": "sag"}],
        stdout="",
        stderr="",
    )

    outcome = RunOutcome(
        spec=spec,
        started_at=1.0,
        ended_at=1.5,
        results=[mag_result, sag_result],
        errors=[],
    )

    registry = MetricsRegistry()
    registry.record(outcome)
    snapshot = registry.snapshot()

    assert snapshot.runs_total == 1
    assert snapshot.runs_failed == 0
    assert snapshot.duration_ms_total == pytest.approx(500.0)
    assert snapshot.turns_total == 2
    assert snapshot.engine_usage["codex-cli"] == 1
    assert snapshot.engine_usage["claude-cli"] == 1
