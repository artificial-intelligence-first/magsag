"""Health and observability routes."""

from __future__ import annotations

from fastapi import APIRouter

from magsag.observability.metrics import get_metrics_registry

router = APIRouter(tags=["health"])


@router.get("/health/metrics")
async def health_metrics() -> dict[str, object]:
    """Return aggregated execution metrics for observability dashboards."""
    registry = get_metrics_registry()
    snapshot = registry.snapshot()
    return {"metrics": snapshot.as_dict()}
