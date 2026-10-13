# Open Items Action Plan

This is the single list of work still open across [engineering-audit.md](./engineering-audit.md) (F#), [adversarial-review.md](./adversarial-review.md) (A#), [remediation-plan.md](./remediation-plan.md) (R#) and [tooling-plan.md](./tooling-plan.md) (P#). The same problem often appears in several of them. Each item below has one ID (W#) and lists every alias, so fix it once and update the status in all four docs.

Rules: no tool-interface or `tools.snapshot.json` changes without approval; JavaScript stays; offline tests only; writes stay off by default.

## Work items (deduplicated)

**Status:** W1, W2, W4, W5 (via `--check` plus a startup `api_key_missing` log; a wrong path to `index.mjs` still cannot be reported because Node fails before our code loads), W6, W7 and W8 are done (80 tests). W3 and W9 remain.

| ID  | Issue                                                                                     | Aliases                | Effort | Priority |
| --- | ----------------------------------------------------------------------------------------- | ---------------------- | ------ | -------- |
| W1  | Verify unchecked claims and fix stale doc text (see below)                                | F9, F10, P6 note       | S      | 1        |
| W2  | Warn on invalid or unknown env values instead of silently falling back; fix `intEnv`      | F11, R8, T-W2          | S      | 2        |
| W3  | Planted-secret gitleaks negative check on a throwaway branch                              | F5, R4, P4             | S      | 3        |
| W4  | Audit log rotation with a `chain_restart` record                                          | F3, R7                 | M      | 4        |
| W5  | Launch wrapper: check path and `HEVY_API_KEY`, print a clear stderr message before start | new (startup failures) | S      | 5        |
| W6  | Add a LICENSE file (package.json says ISC)                                               | README disclaimer      | XS     | 6        |
| W7  | Metrics or exit summary (request counts, breaker trips)                                   | F13, R9                | M      | 7        |
| W8  | Nonce delimiter around untrusted tool output                                              | F14, A8                | M      | 8        |
| W9  | Module split of `index.mjs`                                                               | F12, R9, P8            | L      | Deferred |

## W1 details: verify and clean up docs (do first, it is cheap)

- **F9 validation order:** the audit says Ajv runs before `checkLimits` and the breaker check precedes validation, so invalid calls show as `circuit_open`. Add one test: open the breaker, send an invalid call, and check the error code. If it still reports `circuit_open`, decide whether to reorder (behaviour change, so ask first).
- **F10 error text detail:** check that client-facing errors carry no URL, host or upstream body. The remediation plan already requires a test for this, so confirm it exists.
- **tooling-plan.md line 106** still says "Not done: P6–P8, GET-only retries, 2xx `error`-key handling". P6 and retries are done. Confirm the 2xx `error`-key case against A4's tests, then fix the line.
- **engineering-audit.md** discovery table: stale "44 tests", "no CI", "`^` ranges", "~360 lines". Update them to 72 tests, CI present, exact pins, ~690 lines.
- The "kept for history" notes in the other docs stay as they are.

## Accepted, no action (record once, link from the others)

- F4 `.env` and `audit.log` permissions: owner decision.
- A7 malfunctioning-client scenario: accepted.
- PUT `destructiveHint:false` and OpenAPI annotation quirks: kept to preserve the tool contract.
- F14 stays advisory unless W8 is done.

## Suggested order and budget

1. W1, W2, W6 in one session (small, no behaviour change except warnings on stderr).
2. W3 whenever you are ready to push a throwaway branch.
3. W5 and W4 after approval, because W5 changes startup and W4 changes the audit-log format.
4. W7, W8 and W9 only if the project grows or goes to a marketplace.

## Done when

Each item's status is updated in every alias doc, `npm test`, lint, typecheck and format pass, and CI is green.
