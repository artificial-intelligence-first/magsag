"""Lightweight in-process metrics aggregation for health reporting."""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Dict

from magsag.agent.spec import RunOutcome


@dataclass
class AggregatedMetrics:
    """Aggregated counters used for health reporting."""

    runs_total: int = 0
    runs_failed: int = 0
    duration_ms_total: float = 0.0
    cost_usd_total: float = 0.0
    turns_total: int = 0
    engine_usage: Dict[str, int] = field(default_factory=dict)

    def as_dict(self) -> dict[str, float | int | dict[str, int]]:
        failure_rate = (self.runs_failed / self.runs_total) if self.runs_total else 0.0
        avg_duration = (self.duration_ms_total / self.runs_total) if self.runs_total else 0.0
        return {
            "runs_total": self.runs_total,
            "runs_failed": self.runs_failed,
            "failure_rate": failure_rate,
            "duration_ms_total": self.duration_ms_total,
            "avg_duration_ms": avg_duration,
            "cost_usd_total": self.cost_usd_total,
            "turns_total": self.turns_total,
            "engine_usage": dict(self.engine_usage),
        }


class MetricsRegistry:
    """Thread-safe accumulator for engine execution metrics."""

    def __init__(self) -> None:
        self._metrics = AggregatedMetrics()
        self._lock = threading.RLock()

    def record(self, outcome: RunOutcome) -> None:
        with self._lock:
            self._metrics.runs_total += 1
            if not outcome.ok:
                self._metrics.runs_failed += 1
            run_duration_ms = max(
                0.0, (outcome.ended_at - outcome.started_at) * 1000.0
            )
            self._metrics.duration_ms_total += run_duration_ms

            total_cost = 0.0
            turn_count = 0

            for result in outcome.results:
                self._metrics.engine_usage[result.engine] = (
                    self._metrics.engine_usage.get(result.engine, 0) + 1
                )
                if result.cost_usd:
                    total_cost += float(result.cost_usd)
                turn_count += len(result.events)

            self._metrics.cost_usd_total += total_cost
            self._metrics.turns_total += turn_count

    def snapshot(self) -> AggregatedMetrics:
        with self._lock:
            snapshot = AggregatedMetrics()
            snapshot.runs_total = self._metrics.runs_total
            snapshot.runs_failed = self._metrics.runs_failed
            snapshot.duration_ms_total = self._metrics.duration_ms_total
            snapshot.cost_usd_total = self._metrics.cost_usd_total
            snapshot.turns_total = self._metrics.turns_total
            snapshot.engine_usage = dict(self._metrics.engine_usage)
            return snapshot


_GLOBAL_METRICS = MetricsRegistry()


def get_metrics_registry() -> MetricsRegistry:
    return _GLOBAL_METRICS


def reset_metrics() -> None:
    global _GLOBAL_METRICS
    _GLOBAL_METRICS = MetricsRegistry()


__all__ = ["AggregatedMetrics", "MetricsRegistry", "get_metrics_registry", "reset_metrics"]
