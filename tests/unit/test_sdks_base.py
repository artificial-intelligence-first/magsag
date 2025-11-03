from __future__ import annotations

from typing import TYPE_CHECKING

from magsag.sdks.base import TraceContext, build_trace_context

if TYPE_CHECKING:
    import pytest


def test_build_trace_context_handles_boolean_is_valid(monkeypatch: "pytest.MonkeyPatch") -> None:
    import magsag.sdks.base as base_module

    class FakeSpanContext:
        def __init__(self) -> None:
            self.trace_id = int("0123456789abcdef0123456789abcdef", 16)
            self.span_id = int("89abcdef01234567", 16)
            self.is_valid = True

    class FakeSpan:
        def get_span_context(self) -> FakeSpanContext:
            return FakeSpanContext()

    class FakeTrace:
        @staticmethod
        def get_current_span() -> FakeSpan:
            return FakeSpan()

    monkeypatch.setattr(base_module, "OTEL_AVAILABLE", True)
    monkeypatch.setattr(base_module, "ot_trace", FakeTrace, raising=False)

    ctx: TraceContext = build_trace_context()

    assert ctx.trace_id == "0123456789abcdef0123456789abcdef"
    assert ctx.parent_span_id == "89abcdef01234567"
    assert ctx.traceparent.startswith("00-0123456789abcdef0123456789abcdef")
