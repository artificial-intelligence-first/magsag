"""BudgetController enforces monthly spend limits for providers."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Mapping, Optional


class BudgetExceededError(RuntimeError):
    """Raised when an operation exceeds the configured budget."""


@dataclass
class BudgetLedger:
    """Tracks spend for a single provider."""

    provider: str
    limit_cents: Optional[int] = None
    spent_cents: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def remaining_cents(self) -> Optional[int]:
        if self.limit_cents is None:
            return None
        return max(self.limit_cents - self.spent_cents, 0)


class BudgetController:
    """In-memory budget tracker with optional persistence."""

    def __init__(
        self,
        ledgers: Mapping[str, BudgetLedger],
        *,
        storage_path: Optional[Path] = None,
    ) -> None:
        self._ledgers: Dict[str, BudgetLedger] = dict(ledgers)
        self._storage_path = storage_path or _default_storage_path()
        self._load_state()

    @classmethod
    def from_env(cls) -> Optional[BudgetController]:
        """Initialize controller from environment variables."""
        ledgers: Dict[str, BudgetLedger] = {}
        prefix = "MAGSAG_BUDGET_LIMIT_"
        for key, value in os.environ.items():
            if not key.startswith(prefix):
                continue
            provider = key[len(prefix) :].lower()
            try:
                limit_cents = int(value)
            except ValueError:
                continue
            ledgers[provider] = BudgetLedger(provider=provider, limit_cents=limit_cents)

        if not ledgers:
            return None

        return cls(ledgers=ledgers)

    def ensure_within_budget(self, provider: str, projected_cents: int) -> None:
        """Raise if a provider budget cannot accommodate the projected spend."""
        ledger = self._ledgers.get(provider.lower())
        if ledger is None or ledger.limit_cents is None:
            return

        if ledger.spent_cents + projected_cents > ledger.limit_cents:
            remaining = ledger.remaining_cents or 0
            raise BudgetExceededError(
                f"Budget exceeded for provider '{provider}': "
                f"requested {projected_cents}c with {remaining}c remaining"
            )

    def record_spend(
        self,
        provider: str,
        cost_cents: int,
        *,
        metadata: Optional[Mapping[str, Any]] = None,
    ) -> None:
        """Record spend for a provider and persist state."""
        if cost_cents <= 0:
            return

        provider_key = provider.lower()
        ledger = self._ledgers.get(provider_key)
        if ledger is None:
            ledger = BudgetLedger(provider=provider_key, limit_cents=None)
            self._ledgers[provider_key] = ledger

        ledger.spent_cents += cost_cents
        if metadata:
            ledger.metadata.setdefault("events", []).append(dict(metadata))
        self._persist_state()

    def remaining_budget(self, provider: str) -> Optional[int]:
        ledger = self._ledgers.get(provider.lower())
        return ledger.remaining_cents if ledger else None

    def _load_state(self) -> None:
        if not self._storage_path.exists():
            return

        try:
            with open(self._storage_path, "r", encoding="utf-8") as handle:
                payload = json.load(handle)
        except Exception:
            return

        for provider, state in payload.items():
            ledger = self._ledgers.setdefault(provider, BudgetLedger(provider=provider))
            ledger.spent_cents = int(state.get("spent_cents", ledger.spent_cents))
            ledger.metadata.update(state.get("metadata", {}))

    def _persist_state(self) -> None:
        self._storage_path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            provider: {
                "limit_cents": ledger.limit_cents,
                "spent_cents": ledger.spent_cents,
                "metadata": ledger.metadata,
            }
            for provider, ledger in self._ledgers.items()
        }
        tmp = self._storage_path.with_suffix(".tmp")
        with open(tmp, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        tmp.replace(self._storage_path)


def _default_storage_path() -> Path:
    cache_dir = Path(os.getenv("MAGSAG_CACHE_DIR", Path.home() / ".cache" / "magsag"))
    return cache_dir / "budget_state.json"


__all__ = ["BudgetController", "BudgetExceededError", "BudgetLedger"]
