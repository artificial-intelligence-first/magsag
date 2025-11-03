from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from magsag.agent.spec import RunSpec
from magsag.runners import openai_api


class _DummyUsage:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def model_dump(self) -> dict[str, Any]:
        return dict(self._payload)


class _DummyContent:
    def __init__(self, text: str) -> None:
        self.type = "output_text"
        self.text = text

    def model_dump(self) -> dict[str, Any]:
        return {"type": self.type, "text": self.text}


class _DummyMessage:
    def __init__(self, content: list[_DummyContent]) -> None:
        self.type = "message"
        self.content = content

    def model_dump(self) -> dict[str, Any]:
        return {
            "type": self.type,
            "content": [item.model_dump() for item in self.content],
        }


class _DummyResponse:
    def __init__(self, message_text: str) -> None:
        self.output = [_DummyMessage([_DummyContent(message_text)])]
        self.usage = _DummyUsage({"total_cost": "0.42", "input_tokens": 12})


class _DummyResponses:
    def create(self, *args: Any, **kwargs: Any) -> _DummyResponse:
        return _DummyResponse("OpenAI says hello")


class _DummyClient:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self.responses = _DummyResponses()


@pytest.mark.usefixtures("reset_engine_caches")
def test_openai_runner_normalizes_output(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    runner = openai_api.OpenAIAPIRunner()
    monkeypatch.setattr(openai_api, "OpenAIClientFactory", _DummyClient)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")

    spec = RunSpec(
        prompt="Say hello",
        repo_root=tmp_path,
        mode="api",
        engine_mag="openai-api",
        engine_sag="anthropic-api",
    )

    result = runner.run(spec, role="mag")

    assert result.stdout == "OpenAI says hello"
    assert result.events and result.events[0]["type"] == "message"
    assert result.cost_usd == pytest.approx(0.42)
    assert result.token_usage["input_tokens"] == 12


class _DummyTopLevelResponse:
    def __init__(self, text: str) -> None:
        self.output = [{"type": "output_text", "text": text}]
        self.usage = _DummyUsage({"total_cost": 0.05})


class _DummyTopLevelResponses:
    def create(self, *args: Any, **kwargs: Any) -> _DummyTopLevelResponse:
        return _DummyTopLevelResponse("Top-level says hi")


class _DummyTopLevelClient:
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self.responses = _DummyTopLevelResponses()


@pytest.mark.usefixtures("reset_engine_caches")
def test_openai_runner_handles_top_level_output_text(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    runner = openai_api.OpenAIAPIRunner()
    monkeypatch.setattr(openai_api, "OpenAIClientFactory", _DummyTopLevelClient)
    monkeypatch.setenv("OPENAI_API_KEY", "top-level-key")

    spec = RunSpec(
        prompt="No nested content",
        repo_root=tmp_path,
        mode="api",
        engine_mag="openai-api",
        engine_sag="anthropic-api",
    )

    result = runner.run(spec, role="mag")

    assert result.stdout == "Top-level says hi"
    assert any(event.get("type") == "output_text" for event in result.events)
