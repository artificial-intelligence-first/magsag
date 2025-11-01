"""Test helper skill that performs simple deterministic transforms."""

from __future__ import annotations

from typing import Any, Dict, Iterable, List


async def run(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Return basic transformations over message text and numbers."""
    text = str(payload.get("text", ""))
    value = int(payload.get("value", 0))

    numbers: Iterable[Any] = payload.get("numbers") or []
    if not isinstance(numbers, Iterable) or isinstance(numbers, (str, bytes)):
        numbers = [numbers]
    numeric_list: List[int] = [int(n) for n in numbers if n is not None]

    return {
        "upper_text": text.upper(),
        "value_squared": value * value,
        "numbers_doubled": [n * 2 for n in numeric_list],
        "numbers_total": sum(numeric_list),
        "source": "skill.test-helper-transform",
    }
