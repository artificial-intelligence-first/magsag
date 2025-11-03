from __future__ import annotations

import pytest

from magsag.settings import resolve_engine_config


def test_resolve_engine_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    config = resolve_engine_config()
    assert config.mode == "subscription"
    assert config.engine_mag == "codex-cli"
    assert config.engine_sag == "claude-cli"


def test_resolve_engine_auto_switches_to_api(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")

    config = resolve_engine_config()
    assert config.mode == "api"
    assert config.engine_mag == "openai-api"
    assert config.engine_sag == "anthropic-api"


def test_resolve_engine_auto_stays_subscription_with_partial_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    config = resolve_engine_config()
    assert config.mode == "subscription"
    assert config.engine_mag == "codex-cli"
    assert config.engine_sag == "claude-cli"


def test_resolve_engine_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MAGSAG_ENGINE_MODE", "subscription")
    monkeypatch.setenv("MAGSAG_ENGINE_MAG", "claude-cli")
    config = resolve_engine_config(mode="subscription", mag="codex-cli")
    assert config.mode == "subscription"
    assert config.engine_mag == "codex-cli"
