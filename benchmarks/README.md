---
title: Benchmark Suite
slug: benchmarks
status: living
last_updated: 2025-11-01
tags: [benchmarks, performance, magsag]
summary: "Instructions for running performance benchmarks across MAGSAG components."
authors: []
sources: []
---

# Benchmarks

> **For Humans**: Use this guide to execute and interpret benchmark suites.
>
> **For AI Agents**: Keep benchmark commands in sync with scripts and document any new scenarios.

Performance benchmarks for MAGSAG components.

## Running Benchmarks

### Cache Benchmark

```bash
uv run python benchmarks/cache_benchmark.py
```

This benchmark tests the semantic cache performance with various
embedding models and cache sizes.

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance.
