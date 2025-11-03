"""Common primitives for external SDK dispatch and tracing propagation."""

from __future__ import annotations

import secrets
import threading
from dataclasses import dataclass
from typing import Any, Mapping, MutableMapping, Optional, Protocol, Sequence

try:
    from opentelemetry import trace as ot_trace
    from opentelemetry.trace import SpanContext

    OTEL_AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency
    OTEL_AVAILABLE = False
    SpanContext = Any


TRACE_FLAG_SAMPLED = "01"


def _random_trace_id() -> str:
    """Generate a random 16-byte (32 hex chars) trace identifier."""
    return secrets.token_hex(16)


def _random_span_id() -> str:
    """Generate a random 8-byte (16 hex chars) span identifier."""
    return secrets.token_hex(8)


def _format_trace_id(value: int) -> str:
    return f"{value:032x}"


def _format_span_id(value: int) -> str:
    return f"{value:016x}"


@dataclass(frozen=True)
class TraceContext:
    """Lightweight carrier for W3C trace context propagation."""

    trace_id: str
    span_id: str
    parent_span_id: Optional[str]
    trace_flags: str
    traceparent: str


@dataclass(frozen=True)
class ExternalDispatchRequest:
    """Envelope passed to external SDK dispatchers."""

    skill_name: str
    payload: Mapping[str, Any]
    files: Sequence[str]
    trace_context: TraceContext
    step_id: Optional[str]
    budget_cents: Optional[int]
    timeout_sec: Optional[int]
    audit_tags: Mapping[str, str]
    metadata: Mapping[str, Any]


@dataclass(frozen=True)
class ExternalDispatchResult:
    """Normalized response from external SDK dispatchers."""

    status: str
    output: Mapping[str, Any]
    metadata: Mapping[str, Any]
    error: Optional[str] = None


class ExternalSkillDispatcher(Protocol):
    """Abstraction for Claude/Codex SDK adapters."""

    target: str

    async def dispatch(self, request: ExternalDispatchRequest) -> ExternalDispatchResult:
        ...

    def capabilities(self) -> Sequence[str]:
        """Optional capability declaration."""
        return ()


class ExternalDispatcherRegistry:
    """Thread-safe registry for external dispatchers discoverable by target key."""

    def __init__(self) -> None:
        self._dispatchers: MutableMapping[str, ExternalSkillDispatcher] = {}
        self._lock = threading.RLock()

    def register(self, dispatcher: ExternalSkillDispatcher) -> None:
        with self._lock:
            self._dispatchers[dispatcher.target] = dispatcher

    def get(self, target: str) -> Optional[ExternalSkillDispatcher]:
        with self._lock:
            return self._dispatchers.get(target)

    def list_targets(self) -> list[str]:
        with self._lock:
            return sorted(self._dispatchers.keys())

    def unregister(self, target: str) -> None:
        with self._lock:
            self._dispatchers.pop(target, None)


def build_trace_context(trace_id: Optional[str] = None) -> TraceContext:
    """
    Compose a TraceContext using the current OpenTelemetry span when available.

    Args:
        trace_id: Optional override trace identifier (32 hex chars)

    Returns:
        TraceContext with derived traceparent string.
    """
    current_trace_id: str | None = None
    parent_span_id: str | None = None

    if trace_id:
        trace_id_normalized = trace_id.replace("-", "").lower()
        if len(trace_id_normalized) == 32:
            current_trace_id = trace_id_normalized

    if OTEL_AVAILABLE and current_trace_id is None:
        span = ot_trace.get_current_span()
        if span is not None:
            span_ctx: SpanContext = span.get_span_context()
            is_valid_attr = getattr(span_ctx, "is_valid", False)
            is_valid = is_valid_attr() if callable(is_valid_attr) else bool(is_valid_attr)
            if is_valid:
                current_trace_id = _format_trace_id(span_ctx.trace_id)
                parent_span_id = _format_span_id(span_ctx.span_id)

    if current_trace_id is None:
        current_trace_id = _random_trace_id()

    span_id = _random_span_id()
    traceparent = f"00-{current_trace_id}-{span_id}-{TRACE_FLAG_SAMPLED}"

    return TraceContext(
        trace_id=current_trace_id,
        span_id=span_id,
        parent_span_id=parent_span_id,
        trace_flags=TRACE_FLAG_SAMPLED,
        traceparent=traceparent,
    )


_GLOBAL_REGISTRY = ExternalDispatcherRegistry()


def get_external_dispatcher_registry() -> ExternalDispatcherRegistry:
    """Return the global external dispatcher registry."""
    return _GLOBAL_REGISTRY


def register_external_dispatcher(dispatcher: ExternalSkillDispatcher) -> None:
    """Register a dispatcher using the global registry."""
    _GLOBAL_REGISTRY.register(dispatcher)


def unregister_external_dispatcher(target: str) -> None:
    """Remove a dispatcher from the global registry."""
    _GLOBAL_REGISTRY.unregister(target)


def get_external_dispatcher(target: str) -> Optional[ExternalSkillDispatcher]:
    """Lookup a dispatcher by target key from the global registry."""
    return _GLOBAL_REGISTRY.get(target)


def list_external_dispatchers() -> list[str]:
    """List registered dispatcher targets."""
    return _GLOBAL_REGISTRY.list_targets()


__all__ = [
    "ExternalDispatchRequest",
    "ExternalDispatchResult",
    "ExternalDispatcherRegistry",
    "ExternalSkillDispatcher",
    "TraceContext",
    "build_trace_context",
    "get_external_dispatcher",
    "get_external_dispatcher_registry",
    "list_external_dispatchers",
    "register_external_dispatcher",
    "unregister_external_dispatcher",
]
