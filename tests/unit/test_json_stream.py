from __future__ import annotations

from magsag.runners.json_stream import JsonStreamParser, strip_ansi


def test_strip_ansi_removes_escape_sequences() -> None:
    text = "\u001b[32mHello\u001b[0m"
    assert strip_ansi(text) == "Hello"


def test_json_stream_parser_handles_partial_lines() -> None:
    parser = JsonStreamParser()
    chunk1 = '{"event": "chunk"}\n{"event": "partial"'
    chunk2 = ', "value": 1}\n'

    results_first = parser.feed(chunk1)
    assert len(results_first) == 1
    assert results_first[0]["event"] == "chunk"

    results_second = parser.feed(chunk2)
    assert len(results_second) == 1
    assert results_second[0]["event"] == "partial"
    assert results_second[0]["value"] == 1


def test_json_stream_parser_flush_handles_remaining_buffer() -> None:
    parser = JsonStreamParser()
    parser.feed('{"event": "final"}')
    flushed = parser.flush()
    assert len(flushed) == 1
    assert flushed[0]["event"] == "final"
