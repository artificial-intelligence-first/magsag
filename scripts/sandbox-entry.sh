#!/bin/bash
set -euo pipefail
shopt -s nullglob

declare -a SEARCH_PATHS=()

if [ -n "${NODE_BIN:-}" ]; then
  SEARCH_PATHS+=("$NODE_BIN")
fi

if command -v node >/dev/null 2>&1; then
  SEARCH_PATHS+=("$(command -v node)")
fi

if [ -n "${CODEX_ENV_NODE_VERSION:-}" ]; then
  for candidate in /root/.nvm/versions/node/v"${CODEX_ENV_NODE_VERSION}"*/bin/node; do
    SEARCH_PATHS+=("$candidate")
  done
fi

for candidate in /root/.nvm/versions/node/*/bin/node; do
  SEARCH_PATHS+=("$candidate")
done

SEARCH_PATHS+=("/usr/local/bin/node" "/usr/bin/node")

NODE_BIN=""

for candidate in "${SEARCH_PATHS[@]}"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    NODE_BIN="$candidate"
    break
  fi
done

if [ -z "$NODE_BIN" ]; then
  echo "node binary not found; set NODE_BIN to an executable path" >&2
  exit 2
fi

if ! command -v setpriv >/dev/null 2>&1; then
  echo "setpriv binary not found in PATH" >&2
  exit 2
fi

WORK_DIR="/work"
TMP_DIR="${WORK_DIR}/tmp"
WORK_NODE="${TMP_DIR}/node"

mkdir -p "$TMP_DIR"
rm -f -- "$WORK_NODE"
cp -- "$NODE_BIN" "$WORK_NODE"
chmod 0755 "$WORK_NODE"

env HOME="$WORK_DIR" TMPDIR="$TMP_DIR" setpriv --reuid=65532 --regid=65532 --clear-groups --no-new-privs "$WORK_NODE" /workspace/app/dist/runners/sandbox-runner.js --runtime=ctr
