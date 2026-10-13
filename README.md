# hevy-mcp

A hardened [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) server for the [Hevy](https://hevy.com) workout-tracking API. It lets an AI agent (for example GitHub Copilot in VS Code) read your workouts, routines, exercise history and body measurements, and optionally create or update them.

- 22 tools generated from Hevy's published OpenAPI spec (`hevy-mcp/openapi.json`): 14 read, 8 write.
- **Read-only by default.** Write tools are only exposed when you opt in.
- Plain JavaScript (ES modules), Node 20.12+. Single server file: [`hevy-mcp/index.mjs`](hevy-mcp/index.mjs).
- Offline test suite (72 tests) that never touches a real Hevy account.

## Repository layout

| Path                          | Purpose                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `hevy-mcp/index.mjs`          | The MCP server (stdio transport)                                           |
| `hevy-mcp/openapi.json`       | Hevy API spec the tools are generated from                                 |
| `hevy-mcp/test/`              | Offline tests, local fake Hevy API, and the pinned tool-contract snapshot  |
| `hevy-mcp/smoke.mjs`          | Live **read-only** smoke check                                             |
| `hevy-mcp/verify-audit.mjs`   | Verifies the hash-chained audit log                                        |
| `.mcp.json`                   | VS Code MCP server registration                                            |
| `.github/workflows/ci.yml`    | CI quality gates                                                           |
| `.github/dependabot.yml`      | Dependency and Actions updates                                             |
| `.github/agents/`             | Custom Copilot agent definition                                            |
| `.github/copilot-instructions.md` | Engineering standards for AI assistants                                |
| `docs/`                       | Engineering audit, adversarial review, remediation and tooling plans       |

## Quick start

1. Get an API key (Hevy Pro): <https://hevy.com/settings?developer>
2. Install dependencies:
   ```powershell
   cd hevy-mcp
   npm ci
   ```
3. Copy `.env.example` to `.env` and set `HEVY_API_KEY`. The server loads this file itself. `.env` is gitignored; never commit it.
4. Update the **absolute path** to `index.mjs` in `.mcp.json` to match your checkout.
5. Open the folder in VS Code and start the `hevy` server from the MCP tools list, or run `node index.mjs` manually. On startup it logs a JSON `ready` line to stderr stating how many tools are loaded and whether writes are enabled.

## Configuration

All settings are environment variables (set in `hevy-mcp/.env`).

| Variable                                                          | Default                    | Meaning                                                              |
| ----------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `HEVY_API_KEY`                                                    | required                   | Hevy API key. Never logged or returned.                              |
| `HEVY_ENABLE_WRITES`                                              | off                        | Set to `1` to expose the 8 write tools                               |
| `HEVY_ALLOWED_TOOLS`                                              | all enabled                | Comma-separated allow-list (with or without the `hevy_` prefix)      |
| `HEVY_TIMEOUT_MS`                                                 | 15000                      | Per-request timeout                                                  |
| `HEVY_MAX_READS_PER_MINUTE` / `HEVY_MAX_CONCURRENCY`              | see README in `hevy-mcp/`  | Read rate and concurrency caps                                       |
| `HEVY_MAX_WRITES_PER_MINUTE` / `HEVY_MAX_WRITES_PER_SESSION`      | 10 / 50                    | Write caps                                                           |
| `HEVY_DEDUP_WINDOW_MS`                                            | see README in `hevy-mcp/`  | Suppresses identical repeated POSTs                                  |
| `HEVY_BREAKER_COOLDOWN_MS`                                        | 30000                      | Circuit-breaker cooldown                                             |
| `HEVY_RETRY_BASE_MS`                                              | see README in `hevy-mcp/`  | Backoff base for GET retries                                         |
| `HEVY_AUDIT_LOG`                                                  | `audit.log` next to server | Audit log path, or `off`                                             |
| `HEVY_BASE_URL` / `HEVY_ALLOW_CUSTOM_BASE_URL`                    | `https://api.hevyapp.com`  | Must be https on `api.hevyapp.com` unless explicitly overridden      |

See [`hevy-mcp/README.md`](hevy-mcp/README.md) for full details on each setting.

## Security model

The server assumes the MCP client, and the data returned by Hevy, may be untrusted or malfunctioning.

- **Least privilege:** writes are off by default; keep VS Code's per-call confirmation on when enabled.
- **Strict input validation:** path ids, pagination, dates and request bodies are validated against the OpenAPI schema and size limits before any request is sent.
- **Secrets:** the API key is redacted from all output, logs and audit entries.
- **Prompt-injection defence:** results are returned as JSON in the first content block, followed by a notice to treat the contents as data only. This reduces, but cannot eliminate, the risk.
- **No duplicate mutations:** writes are never auto-retried; a failed write reports "outcome unknown". Identical repeated POSTs are suppressed.
- **Reliability:** explicit timeouts, bounded GET-only retries (502/503/504, honouring `Retry-After`), a 429 and consecutive-failure circuit breaker, response size caps, and redirects never followed.
- **Observability:** one redacted JSON log line per event on **stderr** with a per-call `requestId`. stdout carries only MCP protocol traffic.
- **Audit log:** every tool call is appended to a hash-chained JSONL file; run `npm run verify-audit` to detect tampering.
- **Supply chain:** exact-pinned dependencies, install scripts disabled, SHA-pinned GitHub Actions, Dependabot, `npm audit` and gitleaks in CI.

Only open workspaces you trust: a cloned repo's `.mcp.json` can launch arbitrary commands. Rotate your Hevy key if it ever appears in a chat, log or screenshot.

## Development

Run from `hevy-mcp/`:

```powershell
npm test              # offline tests against a local fake API
npm run lint          # ESLint
npm run format:check  # Prettier
npm run typecheck     # tsc checkJs over JSDoc-typed JavaScript
npm audit             # dependency vulnerabilities
npm run smoke         # live READ-ONLY check against the real API (needs a key)
```

- Tests never make live mutating calls. Write tools are exercised only against the local fake API.
- `hevy-mcp/test/tools.snapshot.json` pins the contract of all 22 tools. Any schema change fails the snapshot test; regenerate it deliberately with `UPDATE_SNAPSHOT=1` only after approval.
- CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, tests and `npm audit` on Node 20 and 22, plus a gitleaks secret scan.
- Optional pre-commit secret scan: create `.git/hooks/pre-commit` containing `gitleaks protect --staged --redact`.

## Documentation

- [`docs/engineering-audit.md`](docs/engineering-audit.md): production-readiness audit
- [`docs/adversarial-review.md`](docs/adversarial-review.md): adversarial review and negative-test design
- [`docs/remediation-plan.md`](docs/remediation-plan.md): prioritised remediation
- [`docs/tooling-plan.md`](docs/tooling-plan.md): tooling plan and implementation status

## Disclaimer

Unofficial project, not affiliated with Hevy. Use of the Hevy API is subject to Hevy's terms. No licence file is included yet; add one before publishing if you want others to reuse the code.
