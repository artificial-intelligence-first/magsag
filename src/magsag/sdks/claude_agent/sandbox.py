"""Sandbox guardrails for Claude Agent SDK dispatchers."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, List, Sequence


_DEFAULT_ALLOWED_COMMANDS: tuple[str, ...] = (
    "ls",
    "cat",
    "sed",
    "grep",
    "find",
    "python",
    "pytest",
    "uv",
    "ruff",
    "mypy",
    "jq",
    "tar",
    "zip",
    "unzip",
    "pandoc",
)


@dataclass
class ClaudeSandbox:
    """Lightweight sandbox policy with command and filesystem guardrails."""

    root: Path = field(default_factory=lambda: Path.cwd())
    allowed_commands: Sequence[str] = field(default_factory=lambda: _DEFAULT_ALLOWED_COMMANDS)
    read_only: bool = True

    def normalize_files(self, files: Iterable[str]) -> List[str]:
        """Resolve file inputs and ensure they remain within the sandbox root."""
        normalized: list[str] = []
        root_resolved = self.root.resolve()
        for item in files:
            path = Path(item).expanduser().resolve()
            if not str(path).startswith(str(root_resolved)):
                raise PermissionError(f"File {path} is outside of sandbox root {root_resolved}")
            normalized.append(str(path))
        return normalized

    def is_command_allowed(self, command: Sequence[str]) -> bool:
        """Return True when the binary is explicitly allowed."""
        if not command:
            return False
        binary = command[0]
        return binary in self.allowed_commands

    def enforce_command(self, command: Sequence[str]) -> None:
        """Raise if the requested command is not permitted."""
        if not self.is_command_allowed(command):
            raise PermissionError(
                f"Command '{command[0] if command else ''}' is not allowed in the Claude sandbox"
            )

    def enforce_write(self, path: str | os.PathLike[str]) -> None:
        """Enforce read-only mode unless explicitly disabled."""
        if not self.read_only:
            return
        raise PermissionError("Write access is not permitted in the default Claude sandbox")

    def describe(self) -> dict[str, object]:
        """Return a serializable snapshot of the sandbox policy."""
        return {
            "root": str(self.root),
            "allowed_commands": list(self.allowed_commands),
            "read_only": self.read_only,
        }
