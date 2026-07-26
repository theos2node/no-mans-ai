# No Man's AI

No Man's AI is an observable laboratory for LLM-directed office simulations. It combines a pixel-office operator surface, a live planner backed by a local or OpenAI-compatible model, an Obsidian-style vault, and a deterministic experiment path for repeatable research.

## Quick start

```bash
npm install
npm run api   # API: http://localhost:8787
npm run dev   # UI: http://localhost:5173
```

The live planner is opt-in through environment variables such as `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`. Do not put secrets in the repository.

## Deterministic and live modes

Live mode preserves the existing office experience: employees plan through the configured model, progress through requests and email, and persist useful memory into `the archives/No man's AI`. Deterministic mode is a fixture-driven laboratory. It uses a versioned scenario, seeded random values, a logical clock, deterministic IDs, and canonical events. It makes no model calls and does not mutate the vault or `data/office-runtime.json`.

Run the included scenario:

```bash
npm run scenario -- refund-approval
npm run scenario -- refund-approval --json
```

The same scenario name, seed, and run ID produce byte-identical canonical JSON. The example covers inbox review, policy/archive lookup, manager approval, outgoing email, and archival.

Deterministic events use schema version 1. Every event has the exact envelope `{ schemaVersion, runId, scenarioId, scenarioVersion, sequence, tick, type, actorId, payload }`. Streams require sequential sequences, nondecreasing integer ticks, one `run.started`, and at most one final `run.finished`; replay also checks scenario identity, seed, actors, locations, actions, payloads, and causal inbox/request references. In-progress streams are replayable.

## Experiment API

The existing live routes remain available: `/api/start`, `/api/stop`, `/api/reset`, `/api/test`, `/api/employees`, and `/events`. Deterministic runs add:

```text
POST /api/runs                 create and start a run
GET  /api/runs/:runId          read run state, events, and metrics
POST /api/runs/:runId/step     execute one fixture step
POST /api/runs/:runId/finish   finish the current run
GET  /api/runs/:runId/events   read canonical events
POST /api/replay               rebuild public state from scenario + events
```

`POST /api/runs` accepts `{ "scenarioId": "refund-approval", "runId": "optional-id", "seed": 424242 }`. The replay endpoint rejects malformed, out-of-order, or post-finish streams.

HTTP JSON bodies are limited to 256 KiB, run IDs must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`, duplicate run IDs return 409, and only the newest 100 deterministic runs are retained. Retention uses bounded insertion-order eviction of the oldest run when the cap is reached. Deterministic routes are isolated from the live planner and vault.

## Architecture and reproducibility

Live orchestration remains in `src/api/simulationEngine.ts`. Deterministic experiment modules live under `src/simulation/`: strict scenario validation, runtime primitives, canonical events, the runner, metrics, and replay projection. The public state is derived from events, so a saved event stream can be inspected or replayed independently of the live engine.

## Development

```bash
npm run check
npm test
npm run build
npm run ci
```

## Data safety and limitations

The project is a local development prototype. The HTTP API has no authentication, and live mode can write to the configured vault. Review environment configuration before running it around sensitive data. Deterministic scenarios currently use a small declarative action vocabulary and do not emulate model-generated plans, token consumption, or full vault contents; those are deliberate follow-up areas.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [LICENSE](LICENSE).
