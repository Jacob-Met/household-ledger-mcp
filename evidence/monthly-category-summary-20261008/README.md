# Preserve every accepted category in monthly summaries

The category field accepts any nonempty string. On the code in
[PR #1](https://github.com/Jacob-Met/household-ledger-mcp/pull/1), commit
`dffabba341a8bce74faa97de68054bd453509a98`, names inherited by ordinary JavaScript
objects do not get their own accumulator. A `constructor` expense of 1,250
minor units against a 1,000-unit budget therefore produces an empty category
breakdown, `spentMinor: null`, `remainingMinor: null`, and `over: false` on the
MCP wire. `__proto__` also changes the process's shared object prototype.

The correction uses a dictionary without an inherited prototype for the
existing `monthlySummary` accumulator. Each category remains an independent
own property and serializes as an ordinary JSON member. The same example now
retains its category, reports 1,250 spent and -250 remaining, and sets
`over: true`. The source change is one line inside `monthlySummary`.

## Verification

The seven regression cases use authored fictional transactions and budgets.
They cover `__proto__`, `constructor`, `toString`, `hasOwnProperty`, a normal
category, a mixed-category summary, an unspent reserved-name budget, repeated
summary calls, unchanged ledger data and inherited objects, and the real MCP
tool with filesystem persistence. Tests restore any polluted inherited fields
when replayed against the original implementation.

| Run | Result | Receipt |
| --- | --- | --- |
| Original source, new seven-case regression | Six fail; normal-category control passes | `baseline.log` |
| Corrected source, complete existing test command plus new regression | 22 pass; zero fail, cancelled or skipped | `candidate.log` |

Run `npm ci` and `npm test` from the repository root. The test command compiles
TypeScript and runs the original domain/MCP cases together with
`test/summary_categories.test.ts`. The original-source replay command was
`npm run build && node --test dist/test/summary_categories.test.js` in an
isolated checkout before the source correction. Runtime, source digests,
commands and results are recorded in `verification.json`.

## Receiving scope

Coordination is the function-specific contribution recorded in
[issue #3](https://github.com/Jacob-Met/household-ledger-mcp/issues/3), with the
estate contributor tracked in
[HAMON #197](https://github.com/Jacob-Met/hamon/issues/197).
The persistence and mutation-handler owner retains its concurrent-write and
idempotency work. This contribution adds one regression file and its test
command entry; it does not change those persistence methods or request handlers.

The local Git parent is a source snapshot, not the upstream commit's original
ancestry. Apply the small contribution to the current PR #1 receiving branch
after checking its source and owner changes. A source merge or these synthetic
MCP calls do not establish deployment or behavior of an already-running service.
