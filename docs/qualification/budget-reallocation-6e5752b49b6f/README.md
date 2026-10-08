# Household Ledger issue 11 — budget reallocation contribution

Source: c83f0a6aee72df86eed17272ee8be6a79b7f941e
Tree: f039e5d078827746c896e5e167ba95299e48cd17
Declared parent: PR8 head 591ab6f5a2d65bf596aeb707dbb635ee981ec926
Repository: https://github.com/Jacob-Met/household-ledger-mcp
Branch: contribution/budget-reallocation-6e5752b49b6f
Source owner: 6e5752b49b6f / production_slice, issue11.

The seven-path contribution adds reviewed atomic movement of budget allowance between two existing categories in one explicit month/currency. It changes no transactions, ledger schema, Store, dependencies or workflow. The guide in source/docs/BUDGET_REALLOCATION.md states the complete current-value replay, no durable request-history/ABA guarantee and single-process persistence boundaries.

## Attribution and adoption

estate-ce7eb129730f retains source-parent disposition. estate-61749b0088e2 retains canonical receiving. Canonical main was still README-only c063549 when this contribution was frozen. Issue5 month-copy, issue6 filtering, CSV clients, reports and other owner scopes are untouched.

budget-reallocation-after-owner.patch is only the declared seven-path delta over exact PR8 head591. Apply or compose it on the accepted parent; do not merge an artifact branch or assume the canonical main already contains the service. Index import, tool-list and dispatch additions must retain the separate month-copy/filter hooks; the two expected-name lists must retain those owners' tools as well.

Public full-tree readback verified all113 unmodified parent leaves/modes, plus all7 planned blobs. The total parent had116 leaves; the contribution modifies3 and adds4. Native hydration includes only22 original source/test/package leaves needed for compilation, plus the new files, not the historical evidence tree.

## Actual qualification, without combining runs into a false full pass

- Native ThinkPad Linux ordinary UID1000; Node22.22.1. Existing TypeScript5.9.3, SDK1.32.1 and Node types24.19.1 were reused read-only and match the unchanged lock. No dependency installation.
- Baseline source compile passed. baseline-probe.json records actual MCP discovery with both new tools absent, explicit unknown-tool refusal, unchanged ledger bytes and a positive existing get_budgets control.
- First focused run:28 of29 cases passed. All27 domain/Store cases and one HTTP case passed. The other HTTP case failed at the existing5-second private-server startup bound before the feature assertions. The exact original log and original pre-cashflow-assertion HTTP test are preserved.
- Final source compiled. Separate exact-source HTTP run passed2/2, including summary/cashflow/recording identity continuity, stale/tampered refusal, fresh review, and a new server process returning already_matching with unchanged bytes/mtime.
- Full native gate used the entire existing wildcard-expanded test set with test files sequenced. Within-test concurrent operations and all existing startup limits/assertions remained unchanged. It completed126 passes/4 failures,0 skips, in120.72s. All4 failures were5-second server-start timeouts: the feature's first HTTP case and all3 unchanged http-cashflow cases. No full-suite pass is claimed. Before/after source hashes are in candidate-full-r1.json.
- A single narrow run of those3 inherited cashflow cases was made after capacity observation (load1m5.98 on8CPUs, about5GB available memory). It passed3/3 in9.25s with unchanged bytes and5-second startup bounds. The feature's exact-source2/2 HTTP pass above remains separate. No broad suite was repeated.
- The native Store tests include actual OS directory-permission write refusal, original-byte preservation, unrelated fresh edit then successful retry; concurrent same/competing reviews; zero endpoint/MAX_SAFE total; literal stored category/currency preservation; stale/mixed/removed pairs and malformed/tampered input refusal.
- Independent receiving is coordinated separately with github_integration. This author packet does not claim its acceptance in advance.
- No hosted CI was invoked: the existing workflow targets main only, and opening a competing canonical PR solely for CI would bypass the parent owners' adoption fence.

The setup's first write attempt encountered a missing owned directory before hydration. The directory was then created and all22 input Git blobs were admitted before baseline compilation. This was a setup failure, not a source/test pass.

No live ledger, deployed service, other checkout or provider was changed. Original failed runs remain immutable. The native private test servers were launched and stopped by their test helpers.

## Reproduction

Use unchanged package-lock.json with the project's supported Node>=20 and dependencies. npm test remains the maintained command. This native receiver invoked node --test --test-concurrency=1 over the complete dist/test/*.test.js list to sequence startup load; run-full-receiving.py records the exact command and source inventory. This is explicitly different from claiming an ordinary hosted npm test pass.

The packet includes final changed source, original modified-file preimages, a narrow patch, native baseline probe/receipts, raw TAP logs, dependency admission and receiving runners. manifest.json hashes every other member. The archive is separately verified against every member before its identity is published.
