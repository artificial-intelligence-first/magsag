"""OpenAI API runner for MAG execution in API mode."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Callable, Mapping, MutableMapping, Optional, cast

from magsag.agent.spec import AgentRole, EngineExecutionResult, RunSpec

try:
    from openai import OpenAI as _OpenAIClient
except ImportError:  # pragma: no cover - optional dependency
    OpenAIClientFactory: Optional[Callable[..., Any]] = None
else:
    OpenAIClientFactory = _OpenAIClient


@dataclass(slots=True)
class OpenAIAPIConfig:
    """Configuration for OpenAI API runner."""

    model: str = "o4-mini"
    temperature: float = 0.3
    max_output_tokens: int = 2048


class OpenAIAPIRunner:
    """Execute OpenAI Responses API requests."""

    name = "openai-api"
    mode = "api"

    def __init__(self, config: OpenAIAPIConfig | None = None) -> None:
        self.config = config or OpenAIAPIConfig()

    def is_available(self) -> bool:
        return OpenAIClientFactory is not None

    def run(
        self,
        spec: RunSpec,
        role: AgentRole,
        *,
        env: Optional[Mapping[str, str]] = None,
        observer_metadata: Optional[MutableMapping[str, Any]] = None,
    ) -> EngineExecutionResult:
        """Execute prompt via OpenAI Responses API."""
        if not self.is_available():
            raise RuntimeError("openai package not installed. Install magsag[openai].")

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not set.")

        if OpenAIClientFactory is None:  # pragma: no cover - defensive
            raise RuntimeError("openai package not installed. Install magsag[openai].")

        client = OpenAIClientFactory(api_key=api_key)

        started = time.perf_counter()

        input_payload: list[dict[str, Any]] = [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": spec.prompt},
                ],
            }
        ]

        response = client.responses.create(
            model=self.config.model,
            input=cast(Any, input_payload),
            temperature=self.config.temperature,
            max_output_tokens=self.config.max_output_tokens,
            metadata={
                "engine_role": role,
                "engine_mode": spec.mode,
            },
        )

        duration_ms = (time.perf_counter() - started) * 1000

        output_texts: list[str] = []
        events: list[dict[str, Any]] = []

        for item in getattr(response, "output", []) or []:
            payload = _normalize_obj(item)
            if payload:
                events.append(payload)
            _collect_output_text(payload, output_texts, events)

        usage = getattr(response, "usage", None)
        token_usage: MutableMapping[str, Any] = {}
        cost_usd: Optional[float] = None
        usage_payload = _normalize_obj(usage)
        token_usage.update(usage_payload)

        total_cost = token_usage.get("total_cost")
        if isinstance(total_cost, (int, float, str)):
            try:
                cost_usd = float(total_cost)
            except ValueError:
                cost_usd = None

        return EngineExecutionResult(
            engine="openai-api",
            role=role,
            prompt=spec.prompt,
            returncode=0,
            duration_ms=duration_ms,
            events=events,
            stdout="\n".join(output_texts),
            stderr="",
            cost_usd=cost_usd,
            token_usage=token_usage,
            metadata=observer_metadata or {},
        )


def _normalize_obj(value: Any) -> dict[str, Any]:
    """Convert SDK response objects into dictionaries."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return dict(value)
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump()
            if isinstance(dumped, dict):
                return dict(dumped)
        except Exception:  # noqa: BLE001
            return {}
    if hasattr(value, "dict"):  # pydantic v1 fallback
        try:
            dumped = value.dict()
            if isinstance(dumped, dict):
                return dict(dumped)
        except Exception:  # noqa: BLE001
            return {}
    if hasattr(value, "__dict__"):
        return {
            key: getattr(value, key)
            for key in dir(value)
            if not key.startswith("_") and not callable(getattr(value, key))
        }
    if isinstance(value, (list, tuple)):
        return {"items": [_normalize_obj(item) for item in value]}
    return {}


def _collect_output_text(
    payload: Mapping[str, Any],
    collector: list[str],
    events: list[dict[str, Any]],
) -> None:
    """Capture textual content emitted by the Responses API."""
    if not isinstance(payload, Mapping):
        return

    item_type = payload.get("type")

    if item_type == "message" and isinstance(payload.get("content"), list):
        for chunk in payload["content"]:
            chunk_payload = _normalize_obj(chunk)
            if chunk_payload:
                events.append(chunk_payload)
            text_value = _extract_text(chunk_payload)
            if text_value is not None:
                collector.append(text_value)
        return

    text_value = _extract_text(payload)
    if text_value is not None:
        collector.append(text_value)


def _extract_text(payload: Mapping[str, Any]) -> str | None:
    """Return plain text from known output payload shapes."""
    if not isinstance(payload, Mapping):
        return None

    if payload.get("type") in {"output_text", "text"}:
        text_value = payload.get("text")
        if isinstance(text_value, str):
            return text_value

    # Fallback: some SDK objects expose `["items"][...]` when normalized
    items = payload.get("items")
    if isinstance(items, list):
        parts: list[str] = []
        for item in items:
            extracted = _extract_text(_normalize_obj(item))
            if extracted:
                parts.append(extracted)
        if parts:
            return "\n".join(parts)

    return None


__all__ = ["OpenAIAPIConfig", "OpenAIAPIRunner"]
