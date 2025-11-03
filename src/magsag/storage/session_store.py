"""Persistence layer for engine session metadata."""

from __future__ import annotations

import contextlib
import json
import os
import threading
import time
from pathlib import Path
from typing import Iterator, Optional, cast

try:  # pragma: win32-no-cover - imported lazily for Windows
    import msvcrt
except ImportError:  # pragma: no cover - non-Windows platforms
    msvcrt = None  # type: ignore[assignment]

try:  # pragma: posix-no-cover - imported lazily for POSIX
    import fcntl
except ImportError:  # pragma: no cover - non-POSIX platforms
    fcntl = None  # type: ignore[assignment]

from magsag.agent.spec import EngineName, RunMode, SessionMeta
from magsag.settings import resolve_engine_config

_GLOBAL_LOCKS: dict[str, threading.RLock] = {}
_GLOBAL_LOCKS_GUARD = threading.RLock()


def _shared_lock_for(root: Path) -> threading.RLock:
    """Return a process-wide lock for the given session store root."""
    normalized = str(root.resolve())
    with _GLOBAL_LOCKS_GUARD:
        lock = _GLOBAL_LOCKS.get(normalized)
        if lock is None:
            lock = threading.RLock()
            _GLOBAL_LOCKS[normalized] = lock
        return lock


@contextlib.contextmanager
def _acquire_file_lock(path: Path) -> Iterator[None]:
    """Acquire an exclusive file lock usable across processes."""
    path.parent.mkdir(parents=True, exist_ok=True)
    lock_handle = path.open("a+b")
    try:
        if fcntl is not None:  # POSIX
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_EX)
        elif msvcrt is not None:  # Windows
            lock_handle.seek(0)
            msvcrt.locking(lock_handle.fileno(), msvcrt.LK_LOCK, 1)
        else:  # Fallback to directory-based rename lock
            token_path = path.with_suffix(".lock.token")
            while True:
                try:
                    token_fd = os.open(str(token_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                except FileExistsError:
                    time.sleep(0.01)
                    continue
                else:
                    os.close(token_fd)
                    break
    except Exception:
        lock_handle.close()
        raise
    try:
        yield
    finally:
        if fcntl is not None:
            fcntl.flock(lock_handle.fileno(), fcntl.LOCK_UN)
        elif msvcrt is not None:
            lock_handle.seek(0)
            msvcrt.locking(lock_handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            token_path = path.with_suffix(".lock.token")
            try:
                os.remove(token_path)
            except FileNotFoundError:  # pragma: no cover - defensive
                pass
        lock_handle.close()


class SessionStore:
    """Filesystem-backed store for engine session metadata."""

    def __init__(self, base_dir: Path | None = None) -> None:
        config = resolve_engine_config()
        root = (base_dir or Path(config.settings.ENGINE_NOTES_DIR)).resolve()
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)
        self._lock = _shared_lock_for(self._root)
        self._lock_path = self._root / ".sessions.lock"

    @contextlib.contextmanager
    def _state_lock(self) -> Iterator[None]:
        with self._lock:
            with _acquire_file_lock(self._lock_path):
                yield

    @property
    def root(self) -> Path:
        return self._root

    def _path_for(self, engine: str) -> Path:
        return self._root / f"{engine}.json"

    def _load_all(self, engine: str) -> dict[str, SessionMeta]:
        path = self._path_for(engine)
        if not path.exists():
            return {}
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

        sessions: dict[str, SessionMeta] = {}
        for key, value in raw.items():
            try:
                engine_name = value["engine"]
                if not isinstance(engine_name, str):
                    continue
                mode_value = value.get("mode", "subscription")
                if mode_value not in {"subscription", "api", "oss"}:
                    mode_value = "subscription"
                sessions[key] = SessionMeta(
                    engine=cast(EngineName, engine_name),
                    repo_root=Path(value["repo_root"]),
                    session_id=value["session_id"],
                    created_at=float(value["created_at"]),
                    last_used=float(value["last_used"]),
                    mode=cast(RunMode, mode_value),
                    notes=value.get("notes"),
                    extra=dict(value.get("extra", {})),
                )
            except (KeyError, TypeError, ValueError):
                continue
        return sessions

    def _dump_all(self, engine: str, sessions: dict[str, SessionMeta]) -> None:
        path = self._path_for(engine)
        payload = {
            key: {
                "engine": meta.engine,
                "repo_root": str(meta.repo_root),
                "session_id": meta.session_id,
                "created_at": meta.created_at,
                "last_used": meta.last_used,
                "mode": meta.mode,
                "notes": meta.notes,
                "extra": dict(meta.extra),
            }
            for key, meta in sessions.items()
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def upsert(self, meta: SessionMeta) -> None:
        """Insert or update session metadata."""
        with self._state_lock():
            sessions = self._load_all(meta.engine)
            existing = sessions.get(meta.session_id)
            if existing is not None:
                merged_extra = dict(existing.extra)
                merged_extra.update(meta.extra)
                meta = SessionMeta(
                    engine=meta.engine,
                    repo_root=meta.repo_root,
                    session_id=meta.session_id,
                    created_at=existing.created_at,
                    last_used=meta.last_used,
                    mode=meta.mode,
                    notes=meta.notes or existing.notes,
                    extra=merged_extra,
                )
            sessions[meta.session_id] = meta
            self._dump_all(meta.engine, sessions)

    def list(self, engine: str | None = None) -> list[SessionMeta]:
        """List sessions for a specific engine or all engines."""
        with self._state_lock():
            if engine is not None:
                sessions = sorted(
                    self._load_all(engine).values(),
                    key=lambda item: item.last_used,
                    reverse=True,
                )
            else:
                all_sessions: list[SessionMeta] = []
                for path in self._root.glob("*.json"):
                    engine_name = path.stem
                    all_sessions.extend(self._load_all(engine_name).values())
                sessions = sorted(all_sessions, key=lambda item: item.last_used, reverse=True)
        return sessions

    def resolve_last(self, engine: str) -> Optional[SessionMeta]:
        """Return most recently used session for engine."""
        sessions = self.list(engine)
        return sessions[0] if sessions else None


def create_session_meta(
    *,
    engine: EngineName,
    repo_root: Path,
    session_id: str,
    mode: RunMode,
    notes: str | None = None,
    extra: dict[str, object] | None = None,
) -> SessionMeta:
    """Factory helper for SessionMeta with timestamps."""
    now = time.time()
    return SessionMeta(
        engine=engine,
        repo_root=repo_root,
        session_id=session_id,
        created_at=now,
        last_used=now,
        mode=mode,
        notes=notes,
        extra=dict(extra or {}),
    )


__all__ = ["SessionStore", "create_session_meta"]
