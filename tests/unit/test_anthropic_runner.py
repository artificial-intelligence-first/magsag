from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from magsag.agent.spec import RunSpec
from magsag.runners import anthropic_api


class _DummyUsage:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def model_dump(self) -> dict[str, Any]:
        return dict(self._payload)


class _DummyBlock:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text

    def model_dump(self) -> dict[str, Any]:
        return {"type": self.type, "text": self.text}


class _DummyResponse:
    def __init__(self, text: str) -> None:
        self.content = [_DummyBlock(text)]
        self.usage = _DummyUsage({"total_cost": 0.21, "output_tokens": 24})


class _DummyMessages:
    def create(self, *args: Any, **kwargs: Any) -> _DummyResponse:
        return _DummyResponse("Anthropic replies hello")


class _DummyClient:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self.messages = _DummyMessages()


@pytest.mark.usefixtures("reset_engine_caches")
def test_anthropic_runner_normalizes_output(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    runner = anthropic_api.AnthropicAPIRunner()
    monkeypatch.setattr(anthropic_api, "Anthropic", _DummyClient)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    spec = RunSpec(
        prompt="Respond nicely",
        repo_root=tmp_path,
        mode="api",
        engine_mag="openai-api",
        engine_sag="anthropic-api",
    )

    result = runner.run(spec, role="sag")

    assert result.stdout == "Anthropic replies hello"
    assert result.events and result.events[0]["type"] == "text"
    assert result.cost_usd == pytest.approx(0.21)
    assert result.token_usage["output_tokens"] == 24
