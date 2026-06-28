#!/usr/bin/env bash
# Live preview for Codespaces: builds + serves Hearth on one port, then watches
# the git remote and auto-rebuilds/restarts whenever new commits are pushed.
# Run once in your Codespace:  npm run autopreview
#
# Make it reachable + safe when the port is public:
#   HEARTH_REQUIRE_AUTH=true HEARTH_PASSWORD=secret HEARTH_JWT_SECRET=$(openssl rand -hex 16) npm run autopreview
set -u

PORT="${PORT:-8080}"
INTERVAL="${INTERVAL:-15}"
SERVER_PID=""

build_and_run() {
  echo "[autopreview] building…"
  npm run build || { echo "[autopreview] build failed; keeping previous server"; return 1; }
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  PORT="$PORT" node server/dist/index.js > /tmp/hearth.log 2>&1 &
  SERVER_PID=$!
  echo "[autopreview] serving on :$PORT (pid $SERVER_PID) — log: /tmp/hearth.log"
}

echo "[autopreview] installing deps…"
npm run install:all >/dev/null 2>&1 || true
build_and_run

echo "[autopreview] watching for pushes (every ${INTERVAL}s). Ctrl-C to stop."
while true; do
  sleep "$INTERVAL"
  git fetch origin >/dev/null 2>&1 || continue
  LOCAL=$(git rev-parse HEAD 2>/dev/null || echo x)
  REMOTE=$(git rev-parse '@{u}' 2>/dev/null || echo "$LOCAL")
  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[autopreview] new commits detected — updating…"
    if git pull --ff-only >/dev/null 2>&1; then
      build_and_run
      echo "[autopreview] updated. Refresh your browser tab."
    else
      echo "[autopreview] git pull failed (local changes?). Skipping."
    fi
  fi
done
