# Engineering Audit: hevy-mcp

Scope: whole repository at `D:\vscode_projects\hevy`. Line numbers refer to [hevy-mcp/index.mjs](../hevy-mcp/index.mjs) unless stated. Audit was read-only; no application behavior was changed.

Labels: **[Verified]** reproduced or confirmed in code/tooling. **[Risk]** plausible, depends on conditions. **[Rec]** improvement, no defect.

## 1. Discovery summary (verified)

| Area | Finding |
|---|---|
| Runtime | Node 22.20 (engines `>=20.12`), ESM, plain JavaScript, no build step, no types |
| Dependencies | `@modelcontextprotocol/sdk` ^1.32.1 (lock: 1.32.1), `ajv` ^8, `ajv-formats` ^3. `npm audit`: 0 vulnerabilities. `package.json` uses `^` ranges while `.npmrc` sets `save-exact` (affects only future installs) |
| Architecture | Single file `index.mjs` (~360 lines): env/config, OpenAPI-to-tool generation, limits/rate/breaker, redaction, audit log, request dispatch, MCP wiring. Low-level SDK `Server` over stdio |
| Tools | 22 generated at startup from `openapi.json` (14 GET, 5 POST, 3 PUT; no DELETE exists). Names from the `NAMES` map (L91). Input schema = inlined OpenAPI params + `body` |
| Auth | `api-key` header from `HEVY_API_KEY`, loaded from `hevy-mcp/.env` (L14) or process env |
| Egress | Single host `api.hevyapp.com` (pinned, L26), https-only, `redirect:"error"`, 15 s timeout |
| Tests | 44 offline `node:test` cases spawning the real server against a fake HTTP API; `smoke.mjs` is live read-only |
| CI/CD | None. Not a git repository; no `.github/workflows` |
| Docs | README, `.env.example`, agent file `.github/agents/hevy.agent.md` |
| Client config | `.mcp.json` with a machine-specific absolute path |

Already good: read-only by default, write allowlist, Ajv input validation, size/depth limits, write rate limits, key redaction, untrusted-output notice, circuit breaker, hash-chained audit log without bodies/keys, 0 known vulnerabilities.

## 2. Findings (ranked: security impact, then operational risk, then effort)

### F1. Path traversal via path parameters `.` / `..` — **High** [Verified]
- **Where:** L302 `encodeURIComponent(String(v))`; the `workoutId`, `routineId`, `folderId`, `exerciseTemplateId`, `date` schemas are bare strings (openapi.json has no `pattern`/`maxLength`).
- **Issue:** `encodeURIComponent("..")` returns `..` (dots are unreserved). `fetch` normalizes the URL, so `/v1/workouts/..` becomes `/v1/`. Verified: `new URL("https://api.hevyapp.com/v1/workouts/" + encodeURIComponent(".."))` has pathname `/v1/`; `.` gives `/v1/workouts/`.
- **Scenario:** A prompt-injected agent calls `hevy_update_workout` with `workoutId:".."`; the request goes to a different resource than the tool's audit entry (`/v1/workouts/{workoutId}`) and the per-tool allowlist imply. `hevy_get_workout` with `"."` silently becomes a list call. Impact is bounded to the Hevy host with the user's own key, but it defeats per-tool scoping.
- **Fix:** Validate path params before building the URL: `^[A-Za-z0-9_-]{1,64}$` for ids, `^\d{4}-\d{2}-\d{2}$` for `date`. Advertised schemas stay unchanged (adding `pattern` would be additive).
- **Complexity:** Low.
- **Test:** Offline test calling every path-param tool with `.`, `..`, `a/b`, `%2e%2e`, empty; assert `isError` and zero requests at the fake API.

### F2. Ambiguous write outcome on timeout — **Medium** [Verified design gap]
- **Where:** L310-312 (timeout), L282 (rate limit counted before the call), L338-342 (generic "Request failed").
- **Issue:** On a POST timeout the server reports "Request failed" though Hevy may have created the resource. The agent will likely retry and create duplicates. Hevy has no idempotency key.
- **Scenario:** Slow network, `hevy_create_workout` times out at 15 s, agent retries, user ends with two workouts.
- **Fix:** For non-GET network errors/timeouts return "outcome unknown: check with a read tool before retrying" and audit `outcome:"unknown"`. No automatic write retries.
- **Complexity:** Low. **Test:** Fake server delays past `HEVY_TIMEOUT_MS` on POST; assert message and audit outcome.

### F3. Audit chain forks under concurrent instances; unbounded growth — **Medium** [Risk]
- **Where:** L234-250. `lastHash` is read once at startup and held in memory; `appendFileSync` has no lock.
- **Issue:** More than one server process (multiple windows/sessions) on one `audit.log` each keep their own `prev`, forking the chain; `verify-audit` then reports false tampering. No rotation or size cap. A malformed last line silently starts a fresh chain (an undetected truncation path). `meta.params` stores raw ids/dates.
- **Fix:** Re-read the tail before each append (or per-process files), size-based rotation, explicit `chain_restart` entry when the tail is unreadable.
- **Complexity:** Medium. **Test:** Two servers on one log, calls on both, assert `verify-audit` passes; corrupt tail produces a `chain_restart` record.

### F4. `.env` readable by all authenticated users — **Medium** [Verified, environment-specific]
- **Where:** `hevy-mcp/.env` has `NT AUTHORITY\Authenticated Users:(I)(F)` (inherited, full control) per `icacls`.
- **Issue:** On a shared Windows machine any local account can read the API key and the audit log. `mode:0o600` (L246) is ignored on Windows.
- **Fix:** Document/script `icacls hevy-mcp\.env /inheritance:r /grant:r "%USERNAME%:F"`; on POSIX warn at startup if group/world readable.
- **Complexity:** Low. **Test:** Documented manual check; POSIX unit test for the warning.

### F5. No version control, CI or quality gates — **Medium** [Verified]
- **Where:** repository root (not a git repo; no workflows). `.gitignore` is inert until `git init`.
- **Issue:** Tests, `npm audit` and lockfile integrity are not enforced; secret protection depends on a repo existing and being checked.
- **Fix:** `git init`, verify `git status` excludes `.env`/`audit.log`, add GitHub Actions: `npm ci`, `npm test`, `npm audit --audit-level=high`, gitleaks; add Dependabot.
- **Complexity:** Low. **Test:** Workflow green on a PR; a deliberately failing test blocks merge.

### F6. HTTP 429 / `Retry-After` unhandled; breaker ignores 4xx — **Medium** [Verified gap]
- **Where:** L343-347 (`status >= 500` only); no retry logic anywhere.
- **Issue:** Hevy asks clients not to hammer it; on 429 the raw error is returned, the agent may loop, and the breaker never trips. No bounded retry for idempotent GETs on transient failures.
- **Fix:** Count 429 toward the breaker, surface `Retry-After`, optionally one jittered retry for GET only.
- **Complexity:** Medium. **Test:** Fake API returns 429 with `Retry-After`; assert message, breaker, GET retries ≤ 1, no retry for POST/PUT.

### F7. Contract protection is weak — **Medium** [Verified gap]
- **Where:** `test/tools.test.mjs`. Tests assert names and routes but not full `inputSchema`/annotations/descriptions. Changes to `toJsonSchema` (L49-90), `NAMES`, or `openapi.json` could alter schemas unnoticed, yet client compatibility is a requirement. `openapi.json` provenance (version `0.0.1`) is undocumented. Few negative/boundary tests; each test spawns a new server.
- **Fix:** Commit a golden snapshot of `tools/list`; add negative/boundary suites; document how `openapi.json` is sourced and refreshed.
- **Complexity:** Low-Medium. **Test:** The snapshot test; mutate a schema and confirm it fails.

### F8. Response fully buffered before size cap — **Low** [Verified]
- **Where:** L318 `await res.text()`, cap applied later in `text()` (L217).
- **Issue:** The 100 000-char cap applies after the whole body is in memory. The timeout bounds duration only.
- **Fix:** Check `content-length` and stream-read with a byte ceiling (e.g. 5 MB).
- **Complexity:** Low-Medium. **Test:** Fake server streams beyond the ceiling; assert abort.

### F9. Validation order — **Low** [Verified]
- **Where:** L260-281. Ajv runs on the full args before `checkLimits`, so huge/deeply nested input is traversed by Ajv first. The breaker check precedes validation, so invalid calls are reported as `circuit_open`.
- **Fix:** Order: `checkLimits`, Ajv, path validation, breaker, write limit.
- **Complexity:** Low. **Test:** Depth-1000 argument fails fast; invalid call during open breaker reports invalid arguments.

### F10. Error text reflects low-level details — **Low** [Verified]
- **Where:** L341-342: `Request failed: ${e.message}` goes to the model (key redacted, otherwise raw: fetch/redirect causes may include URLs).
- **Fix:** Map to stable categories (`timeout`, `network`, `redirect_blocked`); keep detail in audit/stderr.
- **Complexity:** Low. **Test:** Unreachable host and redirect cases assert stable, URL-free messages.

### F11. Config handling — **Low** [Verified]
- `.mcp.json` has a machine-specific absolute path. L157 `intEnv` is convoluted. Invalid `HEVY_TIMEOUT_MS` (L40) silently falls back; unknown names in `HEVY_ALLOWED_TOOLS` are silently ignored.
- **Fix:** Simplify `intEnv`; warn on stderr about invalid/unknown values; document the path edit.
- **Complexity:** Low. **Test:** Table-driven config tests.

### F12. Structure and annotations — **Low** [Rec]
- One file mixes eight responsibilities; module-level mutable state (`writeTimes`, `sessionWrites`, `consecutiveFailures`, `lastHash`) prevents unit testing without spawning processes. Breaker is global, so one failing endpoint pauses every tool. `destructiveHint:false` on PUT (overwrites fields per Hevy docs) is arguable; changing it is a contract-visible annotation change, so decide deliberately.
- **Fix:** Split into small modules only when needed; add JSDoc + `// @ts-check` (no build).
- **Complexity:** Medium. **Test:** Existing tests plus the F7 snapshot unchanged.

### F13. Observability — **Low** [Rec]
- Audit log is good for forensics, but there is no correlation id surfaced to the client, no counters/latency, and stderr is unstructured. Add `requestId` to audit and error results and an exit summary.
- **Complexity:** Low. **Test:** Audit record `requestId` matches the id in the error text.

### F14. Prompt-injection controls are advisory — **Low** [Risk]
- The untrusted-data notice (L212) is a second text item that a model can ignore. The real controls are read-only default, allowlist and rate limits; API free text (titles, notes) reaches the model unchanged. Keep as defense in depth and document that clients should confirm write calls.
- **Complexity:** Low (docs).

### F15. Supply chain residue — **Low** [Verified]
- `^` ranges despite `save-exact`; no Dependabot; no `npm ci` documentation; empty `author`.
- **Fix:** Pin exact versions, add Dependabot, document `npm ci`. **Complexity:** Low.

## 3. MCP compatibility assessment

- All 22 names, schemas and annotations are generated deterministically from `openapi.json`; tests confirm names and routing. **No finding requires changing a tool contract.** F1 only rejects bad input; adding `pattern` would be additive.
- Read/write separation is correct (writes hidden unless `HEVY_ENABLE_WRITES=1`, `readOnlyHint` set).
- Responses are JSON text plus a notice item; errors use `isError`. No `structuredContent`/`outputSchema` (optional).
- Tool descriptions come from the Hevy spec and contain no model-targeted instructions. **[Rec]** Review them as part of the F7 snapshot, since an upstream spec change could inject text.

## 4. Summary

| # | Severity | Type | Effort | Title |
|---|---|---|---|---|
| F1 | High | Verified | Low | Path traversal via `.`/`..` ids |
| F2 | Medium | Verified | Low | Ambiguous write outcome on timeout |
| F7 | Medium | Verified | Low-Med | No contract snapshot; thin negative tests |
| F5 | Medium | Verified | Low | No git/CI/quality gates |
| F6 | Medium | Verified | Med | 429/Retry-After unhandled |
| F3 | Medium | Risk | Med | Audit chain forks with concurrent instances |
| F4 | Medium | Verified | Low | `.env` readable by Authenticated Users |
| F8-F15 | Low | Mixed | Low-Med | See above |
