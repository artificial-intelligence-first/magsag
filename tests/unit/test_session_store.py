from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from multiprocessing import Process
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from magsag.storage.session_store import SessionStore, create_session_meta

if TYPE_CHECKING:
    from magsag.agent.spec import SessionMeta


def test_session_store_upsert_and_list(tmp_path: Path) -> None:
    store = SessionStore(base_dir=tmp_path)
    meta = create_session_meta(
        engine="codex-cli",
        repo_root=tmp_path,
        session_id="sess-1",
        mode="subscription",
        notes="first",
        extra={"resume_token": "abc"},
    )

    store.upsert(meta)

    sessions = store.list("codex-cli")
    assert len(sessions) == 1
    assert sessions[0].session_id == "sess-1"
    assert sessions[0].notes == "first"

    updated = create_session_meta(
        engine="codex-cli",
        repo_root=tmp_path,
        session_id="sess-1",
        mode="subscription",
        notes=None,
        extra={"resume_token": "def"},
    )

    store.upsert(updated)
    sessions = store.list("codex-cli")
    assert sessions[0].extra["resume_token"] == "def"


def test_session_store_parallel_updates_preserve_sessions(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    store_a = SessionStore(base_dir=tmp_path)
    store_b = SessionStore(base_dir=tmp_path)

    original_dump = SessionStore._dump_all
    call_counter = {"value": 0}

    def slow_dump(self: SessionStore, engine: str, sessions: dict[str, SessionMeta]) -> None:
        call_counter["value"] += 1
        if call_counter["value"] <= 2:
            time.sleep(0.05)
        return original_dump(self, engine, sessions)

    monkeypatch.setattr(SessionStore, "_dump_all", slow_dump, raising=False)

    meta_a = create_session_meta(
        engine="codex-cli",
        repo_root=tmp_path,
        session_id="sess-a",
        mode="subscription",
        extra={"resume_token": "aaa"},
    )
    meta_b = create_session_meta(
        engine="codex-cli",
        repo_root=tmp_path,
        session_id="sess-b",
        mode="subscription",
        extra={"resume_token": "bbb"},
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [
            executor.submit(store_a.upsert, meta_a),
            executor.submit(store_b.upsert, meta_b),
        ]
        for future in futures:
            future.result()

    sessions = store_a.list("codex-cli")
    assert {session.session_id for session in sessions} == {"sess-a", "sess-b"}


def _insert_session(base_dir: str, session_id: str) -> None:
    store = SessionStore(base_dir=Path(base_dir))
    meta = create_session_meta(
        engine="codex-cli",
        repo_root=Path(base_dir),
        session_id=session_id,
        mode="subscription",
        extra={"resume_token": session_id},
    )
    store.upsert(meta)


def test_session_store_multiprocess_updates(tmp_path: Path) -> None:
    store_dir = tmp_path / "sessions"
    store_dir.mkdir()

    processes = [
        Process(target=_insert_session, args=(str(store_dir), "sess-proc-a")),
        Process(target=_insert_session, args=(str(store_dir), "sess-proc-b")),
    ]

    for proc in processes:
        proc.start()
    for proc in processes:
        proc.join()
        assert proc.exitcode == 0

    store = SessionStore(base_dir=store_dir)
    sessions = store.list("codex-cli")
    assert {session.session_id for session in sessions} == {"sess-proc-a", "sess-proc-b"}
