---
title: ExecPlan — TypeScript Full Migration (Big Bang)
slug: typescript-full-migration
status: living
last_updated: 2025-11-03
last_synced: '2025-11-03'
tags:
- magsag
- plans
- migration
summary: Big-bang migration of MAGSAG to a TypeScript monorepo with CLI-default runners (codex-cli & claude-cli) and optional API runners (OpenAI Agents, Claude Agent SDK, Google ADK), plus first-class MCP.
description: Replace the Python stack with a TypeScript monorepo (pnpm+turborepo). Re-implement runners, server, CLI, governance, observability, and worktree. Integrate ADK/Agents/Claude SDK. Remove legacy code entirely and cut 2.0.0.
authors: [MAGSAG-AI]
sources:
- https://github.com/artificial-intelligence-first/magsag
- https://github.com/openai/openai-agents-js
- https://github.com/anthropics/claude-agent-sdk-typescript
- https://github.com/google/adk-js
---

# ExecPlan: TypeScript Full Migration (Big Bang)

## Purpose / Big Picture
- Deliver **MAGSAG 2.0** as a **TypeScript-only** monorepo with **CLI-default execution** (no API keys required; ChatGPT/Claude サブスク認証) and **optional API-mode** (OpenAI Agents / Claude Agent SDK / Google ADK). MAG/SAG は任意に割当可能（推奨: MAG=codex-cli, SAG=claude-cli）。

## To-do
- [ ] Create monorepo skeleton (pnpm + turborepo + Node 22)
- [ ] Port core, schema, CLI, server, governance, observability, worktree to TypeScript
- [ ] Implement runners: **codex-cli (default)**, **claude-cli (default)**, openai-agents (opt-in), claude-agent (opt-in), adk (opt-in)
- [ ] Add MCP: client + server packages
- [ ] Migrate tests to vitest; add e2e (CLI/SSE/WS/MCP)
- [ ] GitHub Actions CI (lint/typecheck/test/build/e2e/size)
- [ ] Docs rewrite (README/AGENTS/SSOT/CHANGELOG/PLANS)
- [ ] **Remove Python/FastAPI/uv/legacy** and tag **v2.0.0**

## Parallel Execution Readiness
### Branch / Worktree Rules
1. `uv run magsag wt new <run> --task typescript-full-migration --base main` で作業環境を分離する。既存 Python CLI は削除対象のため手動 worktree を避け、補助スクリプトの追従を期待する。
2. ブランチ命名は `feature/ts-migration/<workstream>/<short-desc>` を基本とし、CI 調整は `ci/ts-migration/<desc>` を使用。共通依存を変更する場合は `integration/ts-migration/shared` を経由。
3. 共有スキーマ／ユーティリティを変更する場合は Merge 前に対象ワークストリームへ明示的に通知し、同一セッションでの衝突を防ぐ。
4. 最小検証は `pnpm --filter <pkg> lint typecheck test`。影響範囲が広い場合のみ `pnpm -r typecheck` → `pnpm -r test` の順に昇格させる。

### Workstream Breakdown
#### Workstream A — MCP First-class Support
- **Scope**: `@magsag/mcp-client`（実装済み）/`@magsag/mcp-server`、CLI/Runner registry 連携、Python MCP 削除。
- **Dependencies**: 既存 Runner/CLI の IPC 契約。Workstream C の SSE/WS 仕様と同期。
- **Deliverables**: MCP サーバー/クライアント TypeScript 実装、stdIO/SSE/HTTP/WebSocket サポート、接続確認用 Fixtures。
- **DoD**:
  - `pnpm --filter @magsag/mcp-server lint typecheck test`
  - CLI `agent run` から MCP 経由でツール一覧を取得できることを手動確認
  - Python 側 MCP 実装を削除し、全 Vitest が通過

#### Workstream B — Core Subsystems Rewrite
- **Scope**: `packages/core` `packages/worktree` `packages/governance` `packages/observability` `packages/storage` の TypeScript 化と統合。
- **Dependencies**: Workstream A の MCP 型、Workstream C の Server イベント定義。
- **Deliverables**: Zod ベースのポリシー型、OpenTelemetry + Pino 観測基盤、ストレージ抽象化。
- **DoD**:
  - 各パッケージで `pnpm --filter <pkg> lint typecheck test`
  - 共通型を `@magsag/schema` に集約し、依存側でコンパイルエラー無し
  - 観測イベントが Server/CLI から取得可能であることを統合テストで検証

#### Workstream C — Server Finishing
- **Scope**: `@magsag/server`（SSE/WS 実装、Zod→OpenAPI 生成、MAG/SAG 切替、セッション + メトリクス導線）。
- **Dependencies**: Workstream A（MCP 接続）/B（スキーマ・観測）から提供される契約。
- **Deliverables**: `/api/v1/agent/run` 完全実装、OpenAPI artefact、SSE/WS ハンドラ、メトリクス出力。
- **DoD**:
  - `pnpm --filter @magsag/server lint typecheck test`
  - OpenAPI 生成を `pnpm --filter @magsag/server build` で再現可能にする
  - SSE/WS/E2E テストを最低 1 ケース整備（Vitest もしくは Playwright）

#### Workstream D — Tests & CI
- **Scope**: vitest 単体・統合・CLI/E2E、GitHub Actions の lint/typecheck/test/build/e2e/size ワークフロー。
- **Dependencies**: Workstream A/B/C の成果物安定後に順次適用。Docs 更新（Workstream E）からの入力コマンド。
- **Deliverables**: `pnpm -r test` 緑、`.github/workflows/ts-mono-ci.yml`（仮）整備、サイズ監視タスク。
- **DoD**:
  - `pnpm vitest --run`（全ワークスペースターゲット）で緑
  - GitHub Actions でワークフローが成功（または `act` で模擬成功）
  - サイズ検査スクリプトの結果を CI アーティファクト化

#### Workstream E — Documentation & Governance Refresh
- **Scope**: README, AGENTS.md, SSOT.md, CHANGELOG.md, docs/workflows/*, docs/governance/*、catalog テンプレート。
- **Dependencies**: Workstream B/C の API・契約確定、Workstream D のコマンド体系。
- **Deliverables**: Frontmatter 準拠のドキュメント、CHANGELOG 更新、ExecPlan Progress 反映。
- **DoD**:
  - `pnpm --filter docs lint` もしくは `uv run python ops/tools/check_docs.py` 相当のバリデーション
  - SSOT リンク整合性確認
  - CHANGELOG `## [Unreleased]` セクションへ 2.0.0 の変更概要を追加

#### Workstream F — Legacy Cleanup & Release
- **Scope**: Python/FastAPI/uv 等の旧資産削除、重複スクリプト整理、`pnpm -r build/lint/test` 緑化、2.0.0 タグ準備。
- **Dependencies**: Workstream A〜E の成果が main に統合されていること。
- **Deliverables**: 旧コードを排除した最終リポジトリ、リリースノート草案、タグ発行手順。
- **DoD**:
  - `pnpm -r build` / `pnpm -r lint` / `pnpm -r test` を連続クリア
  - `git status` クリーンで 2.0.0 タグ作成（drft）を確認
  - ExecPlan の Outcomes & Retrospective を更新

### Coordination Checklist
- 各ワークストリームの着手・停止・完了は Progress セクションへタイムスタンプ付きで追記する。
- 契約変更（schema/API/observability）は `Surprises & Discoveries` へ即記録し、関連ワークストリームへ共有。
- ブランチ衝突が想定される場合は `integration/ts-migration/shared` へ先にマージし、依存ブランチは同取り込みを義務化。
- MCP/Server/Core 関連で `packages/schema` の型を変更した場合はバージョン（prerelease tag）を更新し、CHANGELOG と ExecPlan に併記。

## Progress
- 2025-11-03T00:00:00Z — Plan created
- 2025-11-03T17:30:00Z — Ported MCP client resilience layer to TypeScript (`@magsag/mcp-client`); circuit breaker, retries, and SDK transport integration with Vitest coverage.
- 2025-11-03T17:40:00Z — Pending next: migrate `@magsag/mcp-server` with SDK wiring and end-to-end CLI integration (not started).
- 2025-11-03T18:00:00Z — Established parallel execution board (`docs/development/plans/typescript-full-migration-workstreams.md`) with branch/worktree conventions and DoD checklists.
- 2025-11-03T18:05:00Z — Workstream A assigned (branch `wt/ts-migration-a/typescript-full-migration`, worktree `.worktrees/wt-ts-migration-a-typescript-full-migration-6abadd3`) to implement TypeScript MCP server skeleton.
- 2025-11-03T18:08:00Z — Prepared Workstreams B–F with dedicated worktrees (`.worktrees/wt-ts-migration-{b..f}-typescript-full-migration-6abadd3`) and placeholder branches for incoming assignees.

## Decision Log
- 2025-11-03T00:00:00Z — Big-bang only（段階移行なし）
- 2025-11-03T00:00:00Z — CLI default（APIは任意切替）
- 2025-11-03T00:00:00Z — MAG/SAG role assignable（engineごとに可換）

## Surprises & Discoveries
- （実行中に追記）

## Outcomes & Retrospective
- （完了時に記入）

## Context and Orientation
- 現行の層：CLI / FastAPI / ガバナンス / 観測 / カタログ / ワークツリー。
- 目標構成：TypeScript モノレポ（packages/apps/docs/tests、pnpm+turborepo、Node 22）。
- 外部 SDK:
  - OpenAI Agents SDK: `@openai/agents`
  - Claude Agent SDK: `@anthropic-ai/claude-agent-sdk`
  - Google ADK: `@google/adk`
  - MCP TS SDK: `@modelcontextprotocol/sdk`

### Execution Modes（ENV マトリクス）
- `ENGINE_MODE` = `subscription` | `api` | `oss`
  - `subscription`（既定）→ CLI ランナー固定（APIキー不要）
  - `api` → OpenAI/Anthropic/ADK の API ランナー使用（キーが存在する場合）
- `ENGINE_MAG`, `ENGINE_SAG` = `codex-cli` | `claude-cli` | `openai-agents` | `claude-agent` | `adk`
  - 推奨: `ENGINE_MAG=codex-cli`, `ENGINE_SAG=claude-cli`
- 代表例:
  - 既定: `ENGINE_MODE=subscription ENGINE_MAG=codex-cli ENGINE_SAG=claude-cli`
  - API: `ENGINE_MODE=api ENGINE_MAG=openai-agents ENGINE_SAG=claude-agent`

### API Contract（/api/v1/agent/run）
- 入力: `RunSpec`（engine, repo, prompt, resumeId?, extra?）
- 出力: **SSE/WS ストリーム**で `RunnerEvent`
  - `{"type":"log","data":string}`
  - `{"type":"message","role":"assistant"|"tool"|"system","content":string}`
  - `{"type":"diff","files":[{"path":string,"patch":string}] }`
  - `{"type":"done","sessionId"?:string,"stats"?:{}}`

## Plan of Work
1. Bootstrap monorepo & config（pnpm/turbo/tsconfig/eslint）
2. Implement core/schema（Zod+OpenAPI、Runner IF、events）
3. Implement runners（**CLI default** / API optional）
4. Implement server（Hono/Fastify）+ CLI（oclif）
5. Implement MCP（client/server）
6. Tests（unit/integration/e2e）& CI
7. Docs update & **legacy cleanup** & cut 2.0.0

## Concrete Steps
1. [ ] **Scaffold**：`pnpm-workspace.yaml` / `turbo.json` / `tsconfig.base.json` / `.eslintrc.cjs` / `.prettierignore`
2. [ ] **Packages**（空雛型作成）
    - `@magsag/core`, `@magsag/schema`, `@magsag/cli`, `@magsag/server`,
      `@magsag/worktree`, `@magsag/governance`, `@magsag/observability`,
      `@magsag/runner-codex-cli`, `@magsag/runner-claude-cli`,
      `@magsag/runner-openai-agents`, `@magsag/runner-claude-agent`,
      `@magsag/runner-adk`, `@magsag/mcp-client`, `@magsag/mcp-server`
3. [ ] **Core/Schema**：Runner IF・Event 型・Zod スキーマ・OpenAPI 出力
4. [ ] **Runners（既定）**：
    - `codex-cli`：`codex exec --json`（NDJSON）/ `codex resume` を子プロセスでパース
    - `claude-cli`：`claude -p --output-format stream-json` / `--resume|--continue` をパース
5. [ ] **Runners（任意）**：`openai-agents` / `claude-agent` / `adk`（SDK 薄ラップ）
6. [ ] **Server**：`/api/v1/agent/run`（SSE/WS）・`/api/v1/sessions/*`・`/openapi.json`
7. [ ] **CLI**：`flow/agent/data/mcp/wt` サブコマンドを oclif で等価移植
8. [ ] **MCP**：`mcp-client`（接続）・`mcp-server`（Worktree/Observability/Policies を公開）
9. [ ] **Observability**：OTel+Pino（spans: engine, sessionId, turns, duration_ms ほか）
10. [ ] **Tests**：vitest（ユニット/統合）+ e2e（CLI/SSE/WS/MCP）
11. [ ] **CI**：lint/typecheck/test/build/e2e/size を GH Actions に実装
12. [ ] **Docs**：README/AGENTS/SSOT/CHANGELOG/PLANS を全面更新
13. [ ] **Cleanup**：Python/FastAPI/uv/旧 tests/重複スクリプト/死蔵サンプルを削除
14. [ ] **Cut 2.0.0**：タグ付け・Release ノート発行

## Validation and Acceptance
- **CLI-default** で MAG/SAG が **API キー無し**で実行（Codex/Claude はサブスクサインイン運用）
- MAG/SAG の役割が **ENV/CLI 引数**で入替可能（例：MAG=claude-cli、SAG=codex-cli）
- API モードで **OpenAI Agents / Claude Agent / ADK** が動作
- MCP **client/server** の相互運用が確認済み
- CI が **lint/typecheck/unit/integration/e2e/size** 全てグリーン
- Docs 更新済み・`git status` クリーン

## Idempotence and Recovery
- `pnpm clean && pnpm -r build` は決定的
- スキーマ/型生成は再実行で同一出力
- DB/マイグレーションはリラン対応（SQLite/Better-sqlite3）

## Artifacts and Notes
- OpenAPI/型生成物、CI ログ、テストレポート、Example sessions（SSE/WS transcript）

## Interfaces and Dependencies
- Node 22+, pnpm 9+, git 2.44+
- codex CLI（ChatGPT サインイン前提）、claude CLI（サブスクログイン前提）
