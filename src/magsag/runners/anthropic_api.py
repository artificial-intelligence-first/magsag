"""Anthropic API runner for SAG execution in API mode."""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any, Mapping, MutableMapping, Optional

from magsag.agent.spec import AgentRole, EngineExecutionResult, RunSpec

try:
    from anthropic import Anthropic
except ImportError:  # pragma: no cover - optional dependency
    Anthropic = None


@dataclass(slots=True)
class AnthropicAPIConfig:
    """Configuration for Anthropic API runner."""

    model: str = "claude-3-5-sonnet-20241022"
    temperature: float = 0.2
    max_output_tokens: int = 2048


class AnthropicAPIRunner:
    """Execute Anthropic messages API requests."""

    name = "anthropic-api"
    mode = "api"

    def __init__(self, config: AnthropicAPIConfig | None = None) -> None:
        self.config = config or AnthropicAPIConfig()

    def is_available(self) -> bool:
        return Anthropic is not None

    def run(
        self,
        spec: RunSpec,
        role: AgentRole,
        *,
        env: Optional[Mapping[str, str]] = None,
        observer_metadata: Optional[MutableMapping[str, Any]] = None,
    ) -> EngineExecutionResult:
        if not self.is_available():
            raise RuntimeError(
                "anthropic package not installed. Install magsag[anthropic]."
            )

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set.")

        client = Anthropic(api_key=api_key)

        started = time.perf_counter()

        response = client.messages.create(
            model=self.config.model,
            max_output_tokens=self.config.max_output_tokens,
            temperature=self.config.temperature,
            messages=[
                {
                    "role": "user",
                    "content": spec.prompt,
                }
            ],
            metadata={
                "engine_role": role,
                "engine_mode": spec.mode,
            },
        )

        duration_ms = (time.perf_counter() - started) * 1000

        output_segments: list[str] = []
        events: list[dict[str, Any]] = []

        for block in getattr(response, "content", []) or []:
            payload = _normalize_obj(block)
            events.append(payload)
            block_type = payload.get("type")
            text_value = payload.get("text")
            if block_type == "text" and isinstance(text_value, str):
                output_segments.append(text_value)

        usage = getattr(response, "usage", None)
        token_usage: MutableMapping[str, Any] = _normalize_obj(usage)
        cost_usd = None

        total_cost = token_usage.get("total_cost")
        if isinstance(total_cost, (int, float, str)):
            try:
                cost_usd = float(total_cost)
            except ValueError:
                cost_usd = None

        return EngineExecutionResult(
            engine="anthropic-api",
            role=role,
            prompt=spec.prompt,
            returncode=0,
            duration_ms=duration_ms,
            events=events,
            stdout="\n".join(output_segments),
            stderr="",
            token_usage=token_usage,
            cost_usd=cost_usd,
            metadata=observer_metadata or {},
        )


def _normalize_obj(value: Any) -> dict[str, Any]:
    """Convert Anthropic SDK objects into dictionaries."""
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
    if hasattr(value, "dict"):
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


__all__ = ["AnthropicAPIConfig", "AnthropicAPIRunner"]
