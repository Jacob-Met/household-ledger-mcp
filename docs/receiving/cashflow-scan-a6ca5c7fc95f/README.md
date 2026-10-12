# Cashflow without repeated whole-ledger scans

This contribution improves the existing `cashflow_trend` calculation on the
complete Household Ledger receiving source from [PR #8](https://github.com/Jacob-Met/household-ledger-mcp/pull/8),
commit `591ab6f5a2d65bf596aeb707dbb635ee981ec926`. It is a child contribution
for that receiving branch. Canonical integration remains with the existing
`estate-ce7eb129730f` and `estate-61749b0088e2` owners.

## Behavior

Previously, a request covering 120 months scanned every saved transaction and
budget 120 times. Multi-month requests now partition the same snapshot into
the requested months once. Each month still goes through the unchanged
`monthlySummary` implementation. A one-month request retains the existing
calculation path.

The response fields, inclusive calendar range, source ordering, exact minor-unit
arithmetic, currency selection, empty months, category names and budget rules
are unchanged. The first failing month retains its original validation message.
No financial record, budget, ledger file, MCP handler or dependency changes.
There is no persistent cache: a subsequent request sees subsequent input.

The compatibility boundary is the validated JSON snapshot used by the existing
Store/MCP consumers. The grouping retains references to selected records and
budgets in temporary arrays. That uses additional memory proportional to the
selected input rows. This is not a claim about arbitrary stateful getters or
proxies supplied instead of saved JSON, or about a production installation.

## Qualification

On Linux, Node **24.19.0**, with `npm ci --ignore-scripts --no-audit --no-fund`
using the unchanged lockfile:

- The exact original repository passes **101/101** tests.
- The candidate passes **105/105**, with no skips or cancellations. The existing
  real HTTP, CSV import, persistence/restart, currency and budget tests are part
  of that course.
- Four new tests cover 120-month output equivalence to the existing monthly
  API, changed-input recovery, first-month refusal attribution, and bounded
  date visits. The original passes the three compatibility cases and fails the
  bounded-visit case: **28,800** date visits for 240 records. The candidate makes
  **480** visits for the same request.
- Every measured benchmark response is exactly equal after JSON serialization;
  each saved synthetic ledger remains byte-for-byte unchanged.

## Measured cost

The checked-in [benchmark.json](benchmark.json) contains all raw samples,
fixture/output hashes and environment details. Each result is a median of
seven samples after one warmup, alternating which implementation runs first.
Loading includes the actual `LedgerStore.load()` file read, JSON parse and
validation. Both timed paths include serialization of the complete response.

| Synthetic input | Calculation + serialization, before → after | Load + validate + calculate + serialize, before → after |
| --- | ---: | ---: |
| No transactions, 120 months | 0.510 → 0.492 ms | 1.055 → 0.877 ms |
| 120 records, one month | 0.019 → 0.017 ms | 1.009 → 0.851 ms |
| 12,000 records, 12 months | 3.719 → 1.909 ms | 26.953 → 26.957 ms |
| 60,000 records, 120 months | 122.718 → 25.590 ms | 213.087 → 139.473 ms |

The largest measured case improves calculation time about **4.8×** and the
complete saved-file workflow about **1.53×**. The 12-month saved-file workflow
does not improve measurably in this run. Small sub-millisecond differences are
not a general speed claim. These are local synthetic measurements; filesystem
cache, allocation and runtime noise remain in the raw results. No hosted MCP,
network or installed-service latency was measured.

## Reproduce

Build the original receiving commit and this contribution in separate
checkouts, using their unchanged lockfile:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

Then supply the two emitted `dist/src` directories to the comparison script:

```sh
node docs/receiving/cashflow-scan-a6ca5c7fc95f/benchmark.mjs \
  /absolute/path/to/original/dist/src \
  /absolute/path/to/candidate/dist/src
```

The script creates deterministic synthetic ledgers in a temporary directory,
checks complete output equality on every sample, verifies source-file bytes,
prints JSON, and removes only its own temporary directory. It does not read a
household's actual ledger. No GitHub workflow needs to run for this course.

The receiving owner can take the narrow `src/cashflow.ts` change and its new
test onto the composed service source, run the maintained suite, and rerun an
existing cashflow consumer before deciding installed adoption. The original
cashflow arithmetic and Store remain the receiving contracts.
