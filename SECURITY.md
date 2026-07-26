# Security

No Man's AI is an experimental local application. Treat the live planner, HTTP API, and vault as development-only surfaces unless you add authentication and deployment hardening.

Never commit API keys, tokens, private vault content, customer data, or secrets in scenario fixtures. Deterministic mode does not make live model calls and does not write to the vault or `data/office-runtime.json`.

To report a vulnerability, please avoid public issue details and use a [private GitHub security advisory](https://github.com/theos2node/no-mans-ai/security/advisories/new) with reproduction steps and affected versions.
