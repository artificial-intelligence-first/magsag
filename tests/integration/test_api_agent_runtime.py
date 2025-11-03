from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from magsag.agent.spec import EngineExecutionResult, RunOutcome
from magsag.api.server import app


def test_agent_runtime_endpoint(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    class DummyObserver:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            pass

        def log(self, *args: Any, **kwargs: Any) -> None:
            pass

        def metric(self, *args: Any, **kwargs: Any) -> None:
            pass

        def finalize(self) -> None:
            pass

    def fake_execute_run(*args: Any, **kwargs: Any) -> RunOutcome:
        spec = args[0]
        mag_result = EngineExecutionResult(
            engine="codex-cli",
            role="mag",
            prompt=spec.prompt,
            returncode=0,
            duration_ms=100.0,
            events=[{"msg": "mag"}],
            stdout="plan",
            stderr="",
        )
        sag_result = EngineExecutionResult(
            engine="claude-cli",
            role="sag",
            prompt=spec.prompt,
            returncode=0,
            duration_ms=120.0,
            events=[{"msg": "sag"}],
            stdout="code",
            stderr="",
        )
        return RunOutcome(
            spec=spec,
            started_at=0.0,
            ended_at=0.2,
            results=[mag_result, sag_result],
            errors=[],
        )

    monkeypatch.setattr("magsag.api.routes.agent_runtime.ObservabilityLogger", DummyObserver)
    monkeypatch.setattr("magsag.api.routes.agent_runtime.execute_run", fake_execute_run)

    client = TestClient(app)
    response = client.post(
        "/api/v1/agent/run",
        json={
            "prompt": "Summarise tests",
            "repo": str(tmp_path),
            "mode": "subscription",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["mode"] == "subscription"
    assert payload["engines"]["mag"] == "codex-cli"
    assert len(payload["results"]) == 2


def test_health_metrics_endpoint() -> None:
    client = TestClient(app)
    response = client.get("/api/v1/health/metrics")
    assert response.status_code == 200
    metrics = response.json().get("metrics")
    assert isinstance(metrics, dict)
    assert metrics["runs_total"] == 0
