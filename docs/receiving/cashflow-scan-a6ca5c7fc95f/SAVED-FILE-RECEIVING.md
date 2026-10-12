# Independent saved-file receiving

The public saved-ledger calculation retains the original outcome on all **173
requests** in this complementary source-informed course: **127 complete returned
results** and **46 refusals** match exactly after JSON serialization, including
error class and message. The 35 deliberately saved fictional JSON files retain
their bytes and modification times. A missing input remains missing. No personal
ledger, installed service or held issue #20 receiver is involved.

This receiver was written by `a6ca5c7fc95f/Delivery` after reading the candidate
implementation, independently of the author's partition tests and benchmark.
The [frozen contract](saved-file-contract.md) predates the first execution. This
is source-informed receiving, not a blind review. The benchmark remains the
author's separate measurement; this course adds changed-data and error evidence.

## Exact inputs

- Original PR #8 source: `591ab6f5a2d65bf596aeb707dbb635ee981ec926`.
- Reviewed optimization source: `7223f8c27ab46a4c7a46001219bb7a44ea5d057b`,
  tree `45be4ab43f534736422a8eb711171f9209d5e10e`, offered in
  [PR #33](https://github.com/Jacob-Met/household-ledger-mcp/pull/33).
- The candidate tree is identical to the author's tested local commit
  `1cac6ad`; connector publication created different commit metadata.
- Node used for receiving: **24.19.0**. Build dependencies remain in the
  repository's unchanged lockfile.

| Emitted input | SHA-256 |
| --- | --- |
| Both `ledger.js` files | `8e80c26b8f68767f80d87bc79a41ff0711f5996dffe5652ef859c4ecef3ac48a` |
| Original `cashflow.js` | `447e140cf5879861cf1e25dab9d25c3e74abef98ddf6ce9e8e8ac5a97a21507a` |
| Candidate `cashflow.js` | `dc665de9113511fefe4be37265b5f26d939b1f436acc40317dfd9071ff712582` |

The receipt records complete emitted-file identities and every request's outcome
hash. For refusals it also records the exact error. The expected complete receipt
SHA-256 is `ab5a6d83010edb028cf1c7684e4cd6ad43059486bc7fe76e4af2e9de752e9e7a`.
Fresh runs record the new source-file modification times; use result equality and
source hashes for comparison instead of requiring an identical receipt hash.

## Reproduce

Build the original and candidate in separate checkouts using the commands in
[README.md](README.md). Then run this one command from this evidence directory:

```sh
node receive-saved-cashflow.mjs \
  /absolute/path/to/original/dist/src \
  /absolute/path/to/candidate/dist/src \
  /absolute/path/to/NEW-receiving-output
```

The output parent must exist and the new output directory must not. The receiver
uses Node's standard library, creates only its own new output directory, generates
the fictional ledgers there, and calls each version's `LedgerStore.load()` before
`cashflowTrend()`. It writes `receipt.json`, the request list, and a manually
checked three-month result. No package install or network access occurs in this
command. It does not record transactions, assign budgets or call `save()`.

## What the changed-data course covers

The course varies transaction and budget ordering; prototype-shaped, numeric,
Unicode and multiline categories; normalized currency spelling and explicit
selection; empty and planned-only months; one-month and 120-month ranges;
cross-year boundaries; and data outside the selected range. It exercises legacy
budget refusals, same-month and cross-month integer overflow, invalid saved
records and invalid request arguments. A hand-calculated three-month ledger has
income 1100, expenses 550, net 550 and cumulative net `[600,600,550]`, all in
the synthetic currency's minor units.

Complete outcome equality holds for these saved-JSON cases. It does not establish
hosted MCP latency, installed adoption, arbitrary stateful object behavior or
financial suitability. The existing `estate-ce7eb129730f` and
`estate-61749b0088e2` owners retain canonical integration and adoption authority.
