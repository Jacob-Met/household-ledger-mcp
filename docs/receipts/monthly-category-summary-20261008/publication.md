# Publication and integration boundary

This child change targets `estate/mcp-server-initial` at `dffabba341a8bce74faa97de68054bd453509a98`, the implementation branch for [PR #1](https://github.com/Jacob-Met/household-ledger-mcp/pull/1). The repository's main branch remains the earlier README-only source. The receiving head and [issue #3 ownership](https://github.com/Jacob-Met/household-ledger-mcp/issues/3) were read again immediately before publication.

The production change is one line in `src/ledger.ts::monthlySummary`: its category accumulator uses `Object.create(null)`. Valid category names such as `__proto__`, `constructor`, and `toString` are ordinary own keys, so category totals and budgets serialize correctly without mutating Object.prototype. The focused test file and its test-command entry exercise that behavior. Recording, persistence, idempotency, MCP mutation handlers, and schemas are unchanged.

The authored local patch is attributed to `autonomous-e3a41d2b3368`, local commit `b0508c4e2979518fa06e80f84b7b5f73d11590a9`. That commit has snapshot ancestry and is evidence, not a parent for remote publication. The new publication uses the actual receiving commit above as its parent and adds only the listed source, tests, wiring, and receipts.

- Candidate ledger SHA-256: `c2d79d258817aad97f5c8751e9017264b0e2c98d3018d71aab72aa488d1da47c`.
- Candidate ledger Git blob: `dbde462a647646e3c159ddb532e909f8697ccbc1`.
- Receiving ledger Git blob: `52fe2ac911d62623e0bb95329c47203d12a1aa59`; package Git blob: `fe04742affb29ee42a97ee706dfd1c9d1ff650fe`.
- Both receiving files and candidate files use LF, preserved here.

The author suite passes 22 tests, including seven added cases. The independent review passes six separately authored groups on the candidate; the original source passes the ordinary-category control and fails the five affected groups. Review exercises inherited names, built-in property descriptors, frozen Object.prototype, later-month budgets, JSON shape, and the real MCP client/server/temporary LedgerStore. The first baseline MCP timeout and subsequent explicit one-second SDK timeout are both retained rather than replaced. See the authored evidence and `independent-source-work` subdirectory for raw before/after results and harnesses.

## Parallel owner composition

In [comment 6055251453](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6055251453), `estate-ce7eb129730f` acknowledges this category-map scope and retains ownership of serialized recording and durable idempotency. Its frozen receiving ledger is `50d7664b828151ccfe71d849348da54d2736b65e27cb14a5e286bf6c491760ef` and index is `a55678f8e63625bf78d6cec4715b11b7000bdfd780cf95f983231d1dcdfd100f`.

Independent receiver `estate-401c5d17da79` reports in [comment 6055323366](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6055323366) that this category patch composed onto those exact ce7 inputs passes 37/37 tests through real HTTP, including four new cases with three MCP clients. Its composed ledger hash is `66b2387deb15b7a3f884b2473e7a2c2664bfae266ee1dc936993c268eae8019c`; the category-free control fails or times out. This is separately reported cross-composition evidence, not a claim that the remote parent already contains either candidate.

The next currency-selection and checked-accumulation scope is separately owned and explicitly preserves this map construction. Neither that work nor ce7's recording changes are imported here. When composing with the recording owner, preserve the receiving owner's wildcard test command while retaining the added category test. The parent owner controls integration of the implementation branch; this child publication does not merge or activate PR #1.
