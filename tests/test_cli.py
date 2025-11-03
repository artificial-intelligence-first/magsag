from __future__ import annotations

import json
from typer.testing import CliRunner

from pathlib import Path

import pytest

from magsag.agent.spec import EngineExecutionResult, RunOutcome, RunSpec
from magsag.cli import app

runner = CliRunner()


def test_agent_exec_command_succeeds(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """Test that agent command executes successfully with deterministic output."""

    def fake_execute_run(
        spec: RunSpec, *args: object, **kwargs: object
    ) -> RunOutcome:
        mag_result = EngineExecutionResult(
            engine="codex-cli",
            role="mag",
            prompt=spec.prompt,
            returncode=0,
            duration_ms=100.0,
            events=[{"event": "mag"}],
            stdout="Plan",
            stderr="",
            metadata={"engine": "codex-cli"},
        )
        sag_result = EngineExecutionResult(
            engine="claude-cli",
            role="sag",
            prompt=spec.prompt,
            returncode=0,
            duration_ms=120.0,
            events=[{"event": "sag"}],
            stdout="Patch",
            stderr="",
            metadata={"engine": "claude-cli"},
        )
        return RunOutcome(spec=spec, started_at=0.0, ended_at=0.1, results=[mag_result, sag_result], errors=[])

    class DummyObserver:
        def __init__(self, *args: object, **kwargs: object) -> None:
            pass

        def log(self, *args: object, **kwargs: object) -> None:
            pass

        def metric(self, *args: object, **kwargs: object) -> None:
            pass

        def finalize(self) -> None:
            pass

    monkeypatch.setattr("magsag.cli.execute_run", fake_execute_run)
    monkeypatch.setattr("magsag.cli.ObservabilityLogger", DummyObserver)

    result = runner.invoke(
        app,
        [
            "agent",
            "--json",
            "--repo",
            str(tmp_path),
            "Refine requirements",
        ],
    )
    assert result.exit_code == 0
    output = json.loads(result.stdout)
    assert output["engines"]["mag"] == "codex-cli"
    assert output["results"][0]["metadata"]["engine"] == "codex-cli"


def test_flow_available_command() -> None:
    """Test that flow available command runs without error"""
    result = runner.invoke(app, ["flow", "available"])
    assert result.exit_code == 0
