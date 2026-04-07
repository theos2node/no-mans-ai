# No Man's AI

Office simulation sandbox for testing LLM-directed workers inside a shared pixel office. The current build couples a React control surface, a Node simulation engine, local Ollama/OpenAI-compatible planning, and an Obsidian-style vault that stores shared knowledge, playbook proposals, and per-agent logs.

## Current State

- interactive office map with animated movement, route playback, crowd-aware sprite offsets, and editable layout anchors
- dashboard view with live employee state, request queues, model usage, and runtime controls
- backend workflow engine for planning, approvals, peer requests, inbox handling, and office task execution
- local LLM support through an OpenAI-compatible endpoint or Ollama native structured output
- single-flight planner queue with request gap, retry backoff, and circuit-breaker cooling so local models are not overloaded
- vault-backed archive under `the archives/No man's AI` for shared knowledge, playbook proposals, and agent logs
- current testing roster is reduced to Sam and Jeremy so a local model can be exercised without the full office generating excessive traffic

## Main Files

```text
src/App.tsx
src/styles.css
src/officeNavigation.ts
src/default-layout.json
src/api/server.ts
src/api/simulationEngine.ts
src/api/obsidianVault.ts
scripts/run-local-openai-proxy.sh
the archives/No man's AI/
```

## Run

```bash
npm install
npm run api
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The API server runs on [http://localhost:8787](http://localhost:8787).

## Live Planner Config

Use these env vars for local or remote live planning:

```bash
OPENAI_API_KEY=ollama
OPENAI_BASE_URL=http://127.0.0.1:11435/v1
OPENAI_MODEL=gemma4:e4b
PLANNER_REQUEST_TIMEOUT_MS=120000
PLANNER_MIN_REQUEST_GAP_MS=1500
PLANNER_RETRY_BACKOFF_MS=20000
OPENAI_INPUT_COST_PER_1M=
OPENAI_OUTPUT_COST_PER_1M=
```

Notes:

- `OPENAI_BASE_URL` can point at an OpenAI-compatible proxy or the local Ollama tunnel.
- `Run` uses the live planner; `Test` is still useful for verifying movement and UI behavior without spending model calls.
- The planner queue is serialized, throttled, and backed off after failures so a local server is not hit concurrently or in a tight retry loop.
- Structured output support is used when talking to Ollama natively so plans come back as machine-readable JSON instead of prompt-shaped free text.

## Vault Layout

The Obsidian-style vault lives in `the archives/No man's AI` and currently stores:

- `Agent Logs/` for per-agent chronological activity logs
- `Knowledge Base/Shared Knowledge/` for archived outcomes and shared office context
- `Playbook/Proposals/` for candidate workflows discovered during repeated runs

## API

- `GET /api/health`
- `GET /api/status`
- `GET /api/meta`
- `GET /api/employees`
- `POST /api/start`
- `POST /api/stop`
- `POST /api/reset`
- `POST /api/test`
- `POST /api/employees/sync`
- `GET /events`

## Notes

- The frontend is the operator surface; the backend owns planning, task progression, and persistence into the vault.
- This repository is actively evolving toward stronger agent memory and less repetitive office behavior.
