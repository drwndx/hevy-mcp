# hevy-mcp

MCP server covering the full [Hevy public API](https://api.hevyapp.com/docs/). Tools are generated from `openapi.json` (the spec published by Hevy), including full request-body JSON schemas.

## Setup
1. Get an API key (Hevy Pro) at https://hevy.com/settings?developer
2. `npm install` (Node 20.12+)
3. Copy `.env.example` to `.env` in this directory and set `HEVY_API_KEY`. The server loads that file itself, so no VS Code input prompts or `envFile` are needed. Keep `.env` private; it is gitignored. On Windows, restrict it to your user: `icacls .env /inheritance:r /grant:r "$env:USERNAME:R"`.
4. The workspace `.mcp.json` launches the server with an **absolute path** to `index.mjs`. If you move this folder or clone it elsewhere, update that path.
5. To run manually: `node index.mjs` (stdio). On start it logs `hevy-mcp: ready, 14 tools loaded (writes disabled), API key set` to stderr.

## Testing
- `npm test`: offline tests against a local fake API. They never touch your Hevy account and cover the write tools.
- `npm run smoke`: live **read-only** check against the real API. It starts its own server with writes forced off, so `HEVY_ENABLE_WRITES` in `.env` (which controls your normal agent use) has no effect on it. Write behaviour is only ever tested offline.

## Security notes
- **Read-only by default.** Only the 14 GET tools are exposed. Set `HEVY_ENABLE_WRITES=1` in `.env` to expose the 8 write tools (`create_*` / `update_*`), and keep VS Code's per-call confirmation on. `HEVY_ALLOWED_TOOLS` (comma-separated, with or without the `hevy_` prefix) narrows the set further.
- **Prompt-injection defence.** Titles, notes and names in your data can contain text written by others. Successful results end with a notice telling the model to treat them as data only. This reduces the risk but can't eliminate it, which is why writes are off by default and need confirmation.
- **Input and reliability guards.** Path ids must match `[A-Za-z0-9_-]{1,64}`; page/date/number/time-range values are range-checked server-side; identical POSTs are suppressed for `HEVY_DEDUP_WINDOW_MS`; reads are capped at `HEVY_MAX_READS_PER_MINUTE` and `HEVY_MAX_CONCURRENCY` in flight; non-JSON or empty 2xx responses are reported as errors; a failed write says its outcome is unknown and is never auto-retried; 429 opens the circuit breaker (`HEVY_BREAKER_COOLDOWN_MS`).
- **Write limits.** At most 10 writes/minute and 50 per server session (`HEVY_MAX_WRITES_PER_MINUTE`, `HEVY_MAX_WRITES_PER_SESSION`). Arguments are rejected if a string exceeds 2,000 characters, an array 200 items, nesting 10 levels, or a body 100 KB.
- **Circuit breaker.** After 5 consecutive upstream failures (5xx or network errors), calls pause for 30 s.
- `HEVY_BASE_URL` must be `https://` on `api.hevyapp.com` (loopback `http://` is allowed for tests; any other host needs `HEVY_ALLOW_CUSTOM_BASE_URL=1`), and cannot contain credentials. Redirects are never followed.
- Tool arguments are validated against the OpenAPI schema before any request is sent.
- The API key is redacted from all output, responses are capped at 100,000 characters, and requests time out after 15 s (`HEVY_TIMEOUT_MS` to change).
- **Supply chain.** `.npmrc` disables install scripts and saves exact versions. Install with `npm ci`, and run `npm audit` periodically.
- **Audit log.** Every tool call is appended to `audit.log` (JSONL, next to `index.mjs`; gitignored): timestamp, tool, method, path template, params, outcome (`ok`, `http_error`, `invalid_arguments`, `rate_limited`, `circuit_open`, `request_failed`, `unknown_or_disabled_tool`), HTTP status, duration, and for writes a SHA-256 and size of the body. It never contains the API key or bodies. Entries are hash-chained: run `npm run verify-audit` to detect edited or deleted lines (it can't detect a wholesale rewrite, so copy the log off-machine if that matters). Set `HEVY_AUDIT_LOG=<path>` to relocate it or `off` to disable. The server doesn't rotate it; starting a new file starts a new chain. Example: `Select-String '"write":true' audit.log`.
- Only open workspaces you trust. A cloned repo's `.mcp.json` can launch arbitrary commands.
- Rotate the key in Hevy if it ever appears in a chat, log, or screenshot.
