"""Context helpers for sharing ObservabilityLogger instances."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import Any, Iterator, Optional

from magsag.observability.logger import ObservabilityLogger

_CURRENT_OBSERVER: ContextVar[ObservabilityLogger | None] = ContextVar(
    "magsag_current_observer",
    default=None,
)

_CURRENT_AGENT_POLICIES: ContextVar[dict[str, Any] | None] = ContextVar(
    "magsag_current_agent_policies",
    default=None,
)


def get_current_observer() -> Optional[ObservabilityLogger]:
    """Return the observer bound to the current context, if any."""
    return _CURRENT_OBSERVER.get()


@contextmanager
def use_observer(observer: ObservabilityLogger | None) -> Iterator[None]:
    """Bind an observer to the current context for the duration of the block."""
    token: Token[ObservabilityLogger | None] | None = None
    if observer is not None:
        token = _CURRENT_OBSERVER.set(observer)
    try:
        yield
    finally:
        if token is not None:
            _CURRENT_OBSERVER.reset(token)


def get_current_agent_policies() -> Optional[dict[str, Any]]:
    """Return agent-level policy overrides for the current context, if any."""
    policies = _CURRENT_AGENT_POLICIES.get()
    return policies if policies else None


@contextmanager
def use_agent_policies(policies: Optional[dict[str, Any]]) -> Iterator[None]:
    """Bind agent-level tool policies to the current context."""
    token: Token[dict[str, Any] | None] | None = None
    if policies is not None:
        token = _CURRENT_AGENT_POLICIES.set(policies)
    else:
        token = _CURRENT_AGENT_POLICIES.set(None)
    try:
        yield
    finally:
        if token is not None:
            _CURRENT_AGENT_POLICIES.reset(token)
