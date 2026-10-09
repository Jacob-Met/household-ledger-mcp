# Budget reallocation terminal client — qualified owner handoff

This is receiving custody for Household Ledger issue #15. The repository branch contains only this receiving prefix and the unchanged canonical README. It is not a production-source branch and must not be merged wholesale.

The five-path client consumes the existing issue #11 preview/commit tools. It lists the existing budget categories in an explicit month/currency, preserves literal category identity, displays the complete before/after allowance and review token, and requires exact REALLOCATE before one commit attempt. It never starts a server, edits a ledger directly, persists/replays a review automatically, converts currencies, or interprets already_matching as durable proof of a prior operation. After an uncertain response, inspect current budgets and make a fresh review; repeating the amount can move it again.

## Exact source and composition

- Existing producer owner: 6e5752b49b6f, issue #11.
- Offered producer commit: c83f0a6aee72df86eed17272ee8be6a79b7f941e; tree f039e5d078827746c896e5e167ba95299e48cd17.
- The source-only patch adds exactly src/reallocation-client.ts, src/household-reallocate.ts, test/reallocation-client.test.ts, test/reallocation-client-http.test.ts and docs/REALLOCATION_CLIENT.md.
- after-producer.patch: 32,697 bytes, SHA256 bfdd32804d2b36e993caafdae6bb1f0b29d27884874c3ee133a8e3358ab926d4.
- Accepted 125-leaf product tree: 5b88c9f61af7db76ed3489f6be9a3e65d2214ffe. All 120 producer leaves remain exact.
- Final candidate-source-pins.json pins all 109 selected source and compiled artifact files. Root reconstructed the complete original tree, applied the patch with actual git apply --check/apply, and verified the 31 source closure.
- ce7 retains source-parent disposition; 61749 retains canonical and sibling composition. Preserve all other contributions. The producer native content ancestry is not substituted for canonical Git ancestry.

Use the five exact source copies or the narrow patch against the owner's actual receiving parent. Any overlap needs ordinary current composition receiving. No installed service or aggregate adoption is asserted.

## Actual native receiving

The author preserves the original compile and fixture negatives. R1's three unaffected focused cases passed, including a real upstream commit followed by a lost acknowledgement. Its two fixture failures were corrected only in fixture seeding, keeping the original source and expected outcomes. Final R2 typecheck passed and the two affected methods passed. This is not presented as a single five-case green invocation or a full inherited-suite run.

Root froze an independent contract before candidate exposure. Its original producer oracle passed eight groups and 37 actual MCP tool calls, including content-token nondurability, stale review, unrelated data, and an actual post-commit lost acknowledgement.

Independent terminal receiving then retained R1's four cancellation/EOF/real Ctrl-C children (exit 2, zero commits) and a bookkeeping failure. A later unchanged-server startup observation expired before any CLI. The corrected observer's R3 passed 12 groups with 19 actual PTY children plus a separate pipe and six actual commit calls. Cases include applied, stale, independent matching, unrelated edit preservation, actual lost acknowledgement, restart/fresh review, altered replies, invalid choices/endpoints, real redirect refusal and pipe refusal. The raw source/transport/observer negatives are included, with no runtime correction attributed to them.

A final complete-dependency-bracketed native build passed and reproduced all 109 final artifacts. All 3,898 current dependency regular files and three links were independently verified before/after; see DEPENDENCY-PROVENANCE.md for the earlier selected 2,960-file boundary. Native tools were Node 22.22.1, TypeScript 5.9.3, SDK 1.32.1 and types 24.19.1 from the unchanged lock. No Node 20 or hosted check equivalence is asserted.

## Complete packets

- author-r1.tar.gz: 573,029 bytes, 289 members, SHA256 1dd3c56d4e37b45c384f8504acc84ffe6f737f698501b73e976826d362ee4056.
- root-receiving-r2.tar.gz: 1,143,024 bytes, 590 members, SHA256 887a23714ec250d063f62cf28fd3c06f17b8531e2fe7f8b2891e66953f6c488e.
- ROOT.md is the final corrected root report. The initial report/archive, one dropped digest digit, correction receipt and report-lint negative remain inside the root packet. No product gate was rerun for that report correction.
- Source, outputs, frozen fixtures, full raw receipts, original failures, process closure and source/tree proofs remain recoverable in these packets. Each archive was member-verified and roundtripped before publication.

The distinct installed single-entry extension under issue #13 is outside this packet's product scope. No real ledger, service, credential, global PATH, main/owner branch, PR, merge, workflow, dispatch or Actions execution changes accompany this custody.
