# Tooling and standards plan

Status: **P1–P5 implemented** (see section 6). P6–P8 remain. No tool interface or contract-snapshot change was made.

## 1. Verified language findings

| Fact | Evidence |
|---|---|
| Pure JavaScript ES modules, no TypeScript | `"type": "module"` in `hevy-mcp/package.json`; only `.mjs` files (`index.mjs`, `smoke.mjs`, `verify-audit.mjs`, `test/tools.test.mjs`); no `.ts` or `.js` files |
| Node 22.20 locally, `engines` says `>=20.12` | `node -v`, `package.json` |
| Runtime deps: MCP SDK, ajv, ajv-formats | `package.json`; lockfile present, `save-exact` and `ignore-scripts` set in `.npmrc` |
| Tests use the Node built-in runner (61 tests, offline fake API, contract snapshot) | `test/tools.test.mjs` |
| No lint, format or type-check config; no `.github/workflows` | directory listing |
| Logging is `console.error` (stderr) plus a hash-chained `audit.log` | `index.mjs` L36, L131, L380, L561 |
| One 568-line `index.mjs` holds tool generation, validation, HTTP, audit and redaction | `index.mjs` |

**Decision: stay JavaScript.** Types come from `checkJs` plus JSDoc. A TypeScript conversion has no compelling benefit. The tool schemas are generated at runtime from `openapi.json`, so they cannot be statically typed in either language, and a build step would add supply-chain and debugging surface. Revisit only if the module is split into many files with shared domain types.

## 2. Status against the ten priorities

| # | Priority | Current state | Gap |
|---|---|---|---|
| 1 | checkJs + JSDoc | none | `tsconfig.json`, `typescript` dev dependency, JSDoc on boundaries |
| 2 | ESLint + Prettier | none | configs, scripts, dev dependencies |
| 3 | Node test runner | done | the `test` script hard-codes one file; add a glob |
| 4 | Secrets and env | `.env` gitignored, redaction, `.env.example`; file permissions deliberately excluded | secret scanning, no pre-commit guard |
| 5 | Input validation | done (ajv, semantic checks, strict bodies) | none known |
| 6 | HTTP robustness | timeout, read rate limit, concurrency cap, breaker, 429 `Retry-After`, size cap. **No retries, by design** | keep reads retry-free or add bounded GET-only retry (needs approval); never retry writes |
| 7 | Regression tests for all 22 tools | snapshot covers all 22 schemas; per-tool call coverage not verified | add a coverage assertion (below) |
| 8 | Dependency audit, secret scan | `npm audit` run by hand, 0 vulnerabilities | automate in CI; add gitleaks |
| 9 | GitHub Actions | none | workflow plus Dependabot |
| 10 | Structured logging | stderr only, free-text lines | JSON logger on stderr; stdout stays reserved for MCP |

## 3. Prioritized plan

Each step is independently testable and reversible. Order is by risk reduction per effort.

### P1. Quality gates in CI (High value, low effort)
- Add `.github/workflows/ci.yml`: Node 20 and 22 matrix, `npm ci`, `npm test`, `npm audit --audit-level=moderate`. Pin actions by commit SHA and set `permissions: contents: read`.
- Add `.github/dependabot.yml` for npm and github-actions.
- Add a gitleaks job (also covers priority 8).
- Validation: open a PR with a dummy secret string and confirm the job fails; confirm the green path on the current tree.
- Prerequisite: confirm the repo is a git repo on GitHub. `.git` exists at the repo root, but the session reported no git repository, so check this first.

### P2. Lint and format (Low effort)
- Dev dependencies: `eslint`, `@eslint/js`, `globals`, `prettier`. Use a flat `eslint.config.js` with `recommended` plus `no-console` (allow `error`), `eqeqeq` and `no-unused-vars`.
- Scripts: `lint`, `format:check`. Run Prettier once as a formatting-only commit so it is not mixed with logic.
- Validation: `npm run lint` is clean; the 61 tests and the snapshot are unchanged after formatting.

### P3. Static type checking (Medium effort)
- Add `typescript` as a dev dependency and `tsconfig.json` with `allowJs`, `checkJs`, `noEmit`, `strict`, `module: NodeNext` and `include` of the `.mjs` files.
- Add a `typecheck` script. Start with `// @ts-check` plus a `strict: false` baseline, record the error count, then tighten per file starting with the redaction, validation and audit functions.
- Add JSDoc `@typedef` for the tool descriptor, the fake API options and the audit entry.
- Validation: `npm run typecheck` exits 0 in CI. Do not use `@ts-ignore` without a comment.

### P4. Structured logging (Medium effort)
- Replace ad-hoc `console.error` with a small `log(level, event, fields)` that writes one JSON line to stderr, passes every field through `redact()`, and carries a per-call correlation id. The same id goes into the audit entry.
- Never write to stdout. Add a test that spawns the server, drives a call, and asserts that every stdout line is valid JSON-RPC.
- Validation: the stdout-purity test and a log-redaction test (the key never appears in stderr).
- Out of scope: any change to `audit.log` format, which `verify-audit.mjs` depends on.

### P5. Test coverage per tool (Low effort)
- Add a table-driven test: for each of the 22 tools, assert that a valid call hits the expected method and path on the fake API, that an invalid call is rejected before any request, and that every POST/PUT tool is blocked when writes are disabled.
- Add an assertion that the set of tools under test equals the snapshot's set, so a new tool cannot ship untested.
- Change the `test` script to `node --test "test/**/*.test.mjs"`.
- Validation: delete one tool from the table and confirm the suite fails.
- Optional: use `node --test --experimental-test-coverage` and set a threshold only after measuring.

### P6. Secrets hygiene (Low effort)
- Add a pre-commit hook for gitleaks, documented in the README.
- Add a startup check that fails with a clear message when `HEVY_API_KEY` is missing or has an unexpected shape, without echoing it.
- Keep `.env` out of the repository (already gitignored) and out of tool output and logs (already redacted).
- Excluded at your direction: file permissions on `.env` and `audit.log`.

### P7. Reliability decisions that need your approval
- Bounded retry for GET only (for example 2 retries with jittered backoff, honoring `Retry-After`). It is not needed today because the breaker and rate limits already protect the client. It changes timing but not the tool interface.
- Handling for a 2xx JSON body that contains an `error` key (open item from A4).
- Both need approval before implementation because they alter behavior.

### P8. Structure (optional, last)
- Split `index.mjs` into modules (`config`, `validate`, `http`, `audit`, `redact`) only after P1–P5 are in place. The tests and snapshot will catch regressions. No new dependencies.

## 4. Guardrails for all steps
- The contract snapshot (`test/tools.snapshot.json`) must not change unless a change is explicitly approved.
- No live mutating calls in tests or CI. CI uses only the local fake API, and the CI environment gets no real `HEVY_API_KEY`.
- Add no runtime dependencies. Dev dependencies are limited to ESLint, Prettier and TypeScript.

## 5. Recommended first step
P1, with P2 immediately after. They add enforcement for what already exists (the tests and the audit), have no runtime impact, and every later step then runs under the gates.

## 6. Implementation status (P1–P5)

Verified locally on Node 22.20: `npm test` 70/70 pass, `npm run lint` clean, `npm run typecheck` clean, `npm run format:check` clean, `npm audit` 0 vulnerabilities. The contract snapshot is unchanged.

| Step | Status | Notes |
|---|---|---|
| P1 CI | Implemented and **verified green on GitHub** (commit 0c9a78b, Node 20/22 plus gitleaks) | `.github/workflows/ci.yml` (Node 20/22: `npm ci`, lint, format:check, typecheck, test, `npm audit`; separate gitleaks job), `.github/dependabot.yml`. Actions pinned by SHA, `contents: read`, no `HEVY_API_KEY` in CI. Confirm the repo is on GitHub, and gitleaks-action may need a licence for organisation repos. The dummy-secret check from the plan has not been done. |
| P2 Lint/format | Implemented | ESLint flat config, Prettier (printWidth 140, `endOfLine: auto`). Prettier was applied once across the tree (formatting only). Dev dependencies are exact-pinned. |
| P3 checkJs | Implemented at baseline | `tsconfig.json` with `allowJs`/`checkJs` and `strict: false`. Tightening to `strict: true` per file is still to do. No `@ts-ignore` used. |
| P4 Structured logging | Implemented | `log()` writes one redacted JSON line per event to stderr; each tool call has a `requestId` that is also in the audit entry (an added field; `verify-audit.mjs` still passes). Tests: stdout contains only JSON-RPC, stderr lines are JSON, key never appears in either. |
| P5 Per-tool tests | Implemented | Tests cover all 22 tools: names equal the snapshot, unknown arg rejected, empty call rejected where input is required, write tools hidden/refused when writes are off, upstream 500 reported as an error without leaking the key, 200 non-JSON treated as an error, pure-JSON first block. `test` is now `node --test` (auto-discovery). |

Deviations and findings:
- `test` uses `node --test` rather than the glob in the plan, for Node 20 and 22 compatibility.
- A latent bug was found and fixed while writing tests: a 2xx response with a JSON content-type but an invalid body was passed to `text(null)` instead of being reported as an error. It now returns the "not JSON, not trusted" error. A regression test was added.
- Done later (see open-items-plan.md): P6, P7, GET-only retries, 2xx `error`-key handling, W1–W2, W4–W8. Not done: P8 (module split), gitleaks negative check.
## 7. P6�P8 status

- **P6 Secrets hygiene: implemented.** Startup logs a `api_key_unexpected_shape` warning (never the value) if the key is not UUID-shaped; it warns rather than refuses, since the key format is not contractually guaranteed. The gitleaks pre-commit hook is documented in the README, not installed. File permissions remain excluded.
- **P7 Reliability: GET retry implemented, with your go-ahead.** At most 2 retries on 502/503/504 only (not timeouts, 500s or network errors), `Retry-After` honoured, jittered backoff, GET only; POST/PUT are never retried (tested). Not implemented: treating a 2xx body with an `error` key as a failure, because Hevy signals errors with non-2xx and the rule would be speculative.
- **P8 Module split: deliberately deferred.** The spec-skipping test copies `index.mjs` alone into a temp dir, so a split needs test changes too, and it adds no safety on its own. Revisit when the file grows or a second contributor needs it.

Verified locally: 72/72 tests, lint, typecheck and Prettier clean. CI succeeded on GitHub at 0c9a78b (72 tests). The dummy-secret gitleaks negative check remains not done.
