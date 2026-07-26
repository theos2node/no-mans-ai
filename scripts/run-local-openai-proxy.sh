#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROXY_APP="${LOCAL_OPENAI_PROXY_APP:-}"
PROXY_ENV="${LOCAL_OPENAI_PROXY_ENV:-}"
PROXY_VENV="${LOCAL_OPENAI_PROXY_VENV:-$ROOT_DIR/.proxy-venv}"
PROXY_PORT="${LOCAL_OPENAI_PROXY_PORT:-5001}"

if [ -z "$PROXY_APP" ] || [ -z "$PROXY_ENV" ]; then
  echo "Set LOCAL_OPENAI_PROXY_APP and LOCAL_OPENAI_PROXY_ENV before starting the proxy." >&2
  exit 1
fi

if [ ! -f "$PROXY_APP" ]; then
  echo "Missing proxy app at $PROXY_APP" >&2
  exit 1
fi

if [ ! -f "$PROXY_ENV" ]; then
  echo "Missing proxy env at $PROXY_ENV" >&2
  exit 1
fi

if [ ! -x "$PROXY_VENV/bin/python" ]; then
  echo "Missing local proxy venv at $PROXY_VENV" >&2
  exit 1
fi

set -a
. "$PROXY_ENV"
set +a

export QUEUE_ENABLED=true
export QUEUE_MIN_INTERVAL_SECONDS="${QUEUE_MIN_INTERVAL_SECONDS:-0}"
export QUEUE_MAX_PENDING="${QUEUE_MAX_PENDING:-20}"
export QUEUE_WAIT_TIMEOUT_SECONDS="${QUEUE_WAIT_TIMEOUT_SECONDS:-3600}"

exec "$PROXY_VENV/bin/python" -m uvicorn lan_proxy_app:app --host 127.0.0.1 --port "$PROXY_PORT" --app-dir "$(dirname "$PROXY_APP")"
