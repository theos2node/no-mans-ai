# Contributing

Thanks for helping make No Man's AI a useful, observable office-simulation laboratory.

Run `npm install`, then `npm run check`, `npm test`, and `npm run build` before opening a change. Deterministic scenarios must remain side-effect free, use canonical events without wall-clock values, and include replay or metric coverage when behavior changes. Keep live planner and vault changes clearly separate from fixture-driven experiments.

Please do not include API keys, personal/customer data, generated runtime state, or large binary artifacts in commits. Describe the experiment, seed, and reproducibility expectations in pull requests.
