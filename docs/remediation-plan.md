# Remediation Plan: hevy-mcp

Rules for every step: keep the 22 tool names, descriptions, input schemas and annotations unchanged (guarded by R2); no new dependencies or frameworks; each step ships with its own tests and `npm test` stays green. Finding IDs refer to [engineering-audit.md](./engineering-audit.md).

## R2. Contract snapshot and negative/boundary tests (F7) — do first, effort Low-Med
- **Change:** Add a golden `test/tools.snapshot.json` of the full `tools/list` result (writes enabled), taken from the current build, with a test that diffs it. Add boundary tests (`pageSize` at/over max, empty strings, null body, oversized body, wrong types). Document `openapi.json` provenance in README.
- **Done when:** Any schema/description/annotation change fails the snapshot test.

## R1. Validate path parameters (F1) — effort Low
- **Change:** Before URL construction check `in: path` values against `^[A-Za-z0-9_-]{1,64}$` (ids) or `^\d{4}-\d{2}-\d{2}$` (`date`); reject as `invalid_arguments`.
- **Done when:** `.`, `..`, `a/b`, `%2e%2e`, empty and over-long values are rejected for all 7 path-param tools with zero outbound requests; existing tests and `npm run smoke` still pass (confirms real ids match the pattern).

## R3. Ambiguous write outcome (F2) — effort Low
- **Change:** Non-GET timeout/network error returns "outcome unknown; verify with a read tool before retrying"; audit `outcome:"unknown"`. No automatic write retries.
- **Done when:** Test with a POST delayed past `HEVY_TIMEOUT_MS` shows the message and audit outcome.

## R4. Git, CI, secret hygiene (F5, F15) — effort Low, parallelizable
- **Change:** `git init`; confirm `.env`/`audit.log` are untracked; add `.github/workflows/ci.yml` (`npm ci`, `npm test`, `npm audit --audit-level=high`, gitleaks) and `dependabot.yml`; pin exact versions.
- **Done when:** CI passes on a PR; a planted fake key is flagged.

## R5. Validation order and error text (F9, F10) — effort Low
- **Change:** Order: tool lookup, key present, `checkLimits`, Ajv, path validation, breaker, write limit. Client-facing errors use stable categories; detail goes to audit/stderr.
- **Done when:** Deep-nesting and breaker-open tests pass; error tests assert no URL/host in client text.

## R6. 429 and bounded retry (F6) — effort Medium
- **Change:** Count 429 toward the breaker, surface `Retry-After`, at most one jittered retry for GET on 429/502/503/504/network error; never retry POST/PUT.
- **Done when:** Tests assert retry counts per method and a bounded total time.

## R7. Audit log robustness (F3) — effort Medium
- **Change:** Re-read tail before append (or per-process files), `chain_restart` entry, size-based rotation, `verify-audit.mjs` follows rotation.
- **Done when:** Two concurrent servers on one log verify clean; corruption is detected or explicitly marked.

## R8. Local hardening and config validation (F4, F11, F8) — effort Low-Med
- **Change:** README/script for `.env` ACLs; warn on invalid/unknown env values; simplify `intEnv`; stream-read with a byte ceiling.
- **Done when:** Config table tests pass; an oversized streamed response is aborted.

## R9. Optional structure and observability (F12, F13, F14) — effort Medium
- **Change:** Only if the file keeps growing: extract policy/audit/http modules, `// @ts-check` JSDoc, `requestId` in audit and errors, per-endpoint breaker, README guidance on confirming writes.
- **Done when:** All earlier tests and the R2 snapshot are unchanged and green. Skip if no new features are planned.

## Sequence
R2 -> R1 -> R3 -> R5 -> R6 -> R7 -> R8 -> R9, with R4 in parallel at any point.
