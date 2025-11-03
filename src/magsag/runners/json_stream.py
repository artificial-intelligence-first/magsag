"""Utilities for parsing newline-delimited JSON streams from CLIs."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Iterator

ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def strip_ansi(value: str) -> str:
    """Remove ANSI escape sequences from a string."""
    return ANSI_ESCAPE_RE.sub("", value)


@dataclass(slots=True)
class JsonStreamParser:
    """Incremental parser for newline-delimited JSON documents."""

    allow_partial: bool = True
    _pending: str = field(default="", init=False)

    def feed(self, chunk: str) -> list[dict[str, Any]]:
        """Feed raw text chunk and return parsed JSON objects."""
        if not chunk:
            return []

        text = strip_ansi(chunk)
        buffer = self._pending + text
        items: list[dict[str, Any]] = []

        while True:
            newline_index = buffer.find("\n")
            if newline_index < 0:
                break

            candidate = buffer[:newline_index]
            buffer = buffer[newline_index + 1 :]

            candidate = candidate.strip()
            if not candidate:
                continue

            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                # Buffer and wait for more data
                buffer = candidate + "\n" + buffer
                break
            else:
                items.append(parsed)

        self._pending = buffer
        return items

    def flush(self) -> list[dict[str, Any]]:
        """Attempt to parse any pending buffered JSON."""
        if not self._pending.strip():
            self._pending = ""
            return []

        try:
            parsed = json.loads(self._pending.strip())
            result = [parsed]
        except json.JSONDecodeError:
            result = []
        finally:
            self._pending = ""
        return result


def iter_decode(chunks: Iterable[str]) -> Iterator[dict[str, Any]]:
    """Decode newline-delimited JSON from an iterable of strings."""
    parser = JsonStreamParser()
    for chunk in chunks:
        for item in parser.feed(chunk):
            yield item
    for item in parser.flush():
        yield item


__all__ = ["JsonStreamParser", "iter_decode", "strip_ansi"]
