# Independent native MCP receiving: Household transaction filters

## Verdict and source boundary

Accepted for the exact native source contribution
`f3aa61a5576c3cffb4c6762d5ef8aa970ec86634`
(tree `e69cd3751afae62e293a44f6300ed882fe2aa187`) in
`Jacob-Met/household-ledger-mcp`.

The unchanged independent receiver passes all **14 actual MCP query cases / 98
explicit checks**. The complete original native parent
`07e223b5da19cea0f048219d8c85689fcc1ba83f`
(tree `76cd2cc60b10dabdd301d32a53da4b833015193d`) passes both existing-filter
controls and preserves every ledger invariant, while its absent new selectors
produce 23 expected count/page failures: **2/14 cases, 75/98 checks**.

This is a source-owner receiving contribution after the existing native 07e223b5
work. It does **not** establish canonical-main ancestry, a public production-tree
integration, or a native installation. The parent coordinator retains the existing
#3 owner-review handoff and issue #6 scope.

## What the independent corpus establishes

The receiver creates one **7,554-byte synthetic version-2 ledger** per run, with
22 transactions across JPY, USD and EUR, plus two denominated budgets. The rows,
counts and expected page members were hand-enumerated before candidate source
intake. No copy of the production predicate computes the expected answers.

Several rows are deliberately interleaved inside the selected date window.
One matches the text but has the wrong currency; another has the right currency
but misses the literal text. They sit ahead of or among valid page members.
This makes filtering after slicing, or counting before all predicates, observably
wrong. The old source reports six matches and the wrong page; the candidate
reports four and returns the two exact expected rows.

| Native MCP case | Expected candidate result | Original result |
| --- | --- | --- |
| All predicates before offset 1 / limit 2 | Total 4; original rows E and F | Total 6; wrong page |
| Limit zero | Total 4; empty page | Total 6 |
| Offset equal to the filtered total | Total 4; empty page | Total 6; nonempty page |
| Exact category AND new predicates | Total 4; D, E, F, G | Total 5 |
| Incompatible existing category control | Empty | Passes |
| NFC and case-insensitive category OR note | Nine exact JPY records | Returns all 22 |
| Literal `[Q]+.` punctuation | Eight exact JPY records; excludes regex-like QQQx | Returns all 22 |
| Same Unicode text restricted to USD | Two exact USD records | Returns all 22 |
| Japanese note and category across denominations | Two original records, one JPY and one USD | Returns all 22 |
| Phrase spanning category and note | Empty; ALPHA + BETA are separate fields | Returns all 22 |
| Hidden transaction-ID sentinel | Empty | Returns all 22 |
| Hidden idempotency-key sentinel | Empty | Returns all 22 |
| Omitted new selectors control | Existing total 5 and stable same-date page member U | Passes |
| Currency-only AND old filters before paging | Total 2; original USD row U | Total 6; wrong page |

The fixture includes both decomposed and precomposed accented text, an absent
note, and a retained stored currency `" jPy "` admitted by the existing loader.
Comparison uses the documented normalization, while the response preserves the
entire original transaction object, including its original currency spelling,
Unicode bytes, note, ID, creation time, amount and recording key.

Every query checks the complete returned objects against the original input,
not only selected fields. Every query also checks the ledger SHA-256, device,
inode, size, mode, nanosecond modification/change timestamps, and the containing
directory's members. All such checks pass on both sources. The complete ledger,
version and both budgets are unchanged through the full read phase and server
shutdown. These observations, together with the actual read-only dispatch path,
support the no-ledger-rewrite result for this receiver; no syscall trace or
general filesystem crash-durability claim is made.

## Actual receiving route

The maintained `npm run build` compiles each exact source tree with TypeScript.
A fresh child process executes its actual `dist/src/index.js`, with an explicit
private ledger path and an ephemeral loopback port. The real SDK Client and
StreamableHTTPClientTransport perform initialization, tools/list and all 14
`list_transactions` calls against `/mcp`.

The exercised route is:

`SDK Client → actual Streamable HTTP server → createMcpServer →
list_transactions dispatch → LedgerStore.load/validateLedgerData →
listTransactions → actual MCP result`.

There are no copied production functions, transport mocks, store mocks, helper
substitutions, or recording/import calls. The fixture is an explicitly authored
persisted ledger, which the actual store loader validates. This complements the
implementation owner's separate CSV-import receiving path. No owner test method
was executed again; the maintained build compiles its sources and tests, while
only this independent query driver is run.

Execution used macOS 26.6.2 arm64, Node **v26.3.0**, npm **11.16.0**,
MCP SDK **1.32.1**, TypeScript **5.9.3** and @types/node **24.19.1**.
Both private dependency installs used `npm ci --ignore-scripts --no-audit --no-fund`.
The package-lock SHA-256 is
`446d4d6122958b393d384d61d3187004e965b9de09dfba34192b17c5a7d1c8ff`;
the installed package identities match between runs.

Only the private server processes created by this receiver are started and
stopped. All files remain. No live ledger, account, shared server or GitHub write
is involved.

## Source identity and independent sequence

The complete native original snapshot has 83 files. The candidate snapshot has
86 files. Every file matches its exact native Git blob; the six changed paths
are exactly the owner's contribution and 80 prior files are unchanged.

| Production file | Original blob | Candidate blob |
| --- | --- | --- |
| src/index.ts | `4df804650663542d0d014a925bc68241493ae517` | `51c917262205de34696e747df9f21ad7f07de263` |
| src/ledger.ts | `2ff8133404f19c705eb7b7f0a943e8190f3328d6` | `0af7d35045b7c1bac7667da553fac58cd02dc922` |

The other four paths are README.md, docs/TRANSACTION_FILTERS.md and the two
owner-authored tests. No production change occurs outside the filter interface,
selector validation/matching, and MCP tool description/schema.

Reviewer history:

- Complete original native source intake:
  `d1b84d9b0cfe284e4563467943b19437e5a49967`.
- Frozen independent driver, corpus and handwritten expected cases:
  `626a390325350307a76b156ab8e709c946ed92cc`.
- Original native results, preserved before candidate implementation intake:
  `2ee112b3781b409144759b3c978a322969388421`.
- Exact candidate intake:
  `9de1ceecdc96fd5f9ceebf44757ef4d2e93c1ebf`.

The driver and fixture bytes are identical in both runs. Both receipts bind the
actual source inputs and executed JavaScript hashes; source inputs are checked
again after execution. Complete source-tree byte parity is also retained in the
two source manifests. There were no bootstrap or harness errors and no source
or oracle corrections.

## Evidence and replay

The native reviewer workspace is
`/Users/me/household-filter-independent-18a24bf0c281-runtime` on Mac
`0e3d582f-e25b-44b2-8418-9639fc4e4e33`.

- [qualification-summary.json](qualification-summary.json) gives the exact verdict,
  source lineage, action/check counts, dependency identities and immutability result.
- [baseline-source.json](baseline-source.json) and
  [candidate-source.json](candidate-source.json) bind all 83/86 source files.
- [baseline-v1-receipt.json](baseline-v1-receipt.json) and
  [candidate-v1-receipt.json](candidate-v1-receipt.json) preserve every native
  request/result and per-query file witness.
- [receiving/case-spec.json](receiving/case-spec.json) contains all expected counts
  and row identities, and [receiving/fixture-ledger.json](receiving/fixture-ledger.json)
  is the exact authored input.
- [raw-evidence.tar.xz](raw-evidence.tar.xz) and
  [raw-evidence-manifest.json](raw-evidence-manifest.json) preserve the complete
  original and candidate source snapshots, frozen receiver, dependency receipts,
  build/receiver/server logs and both unchanged ledger files. Archive metadata is
  normalized; each regular file's contents remain exact.

The retained native workspace can be reproduced with a new run label through
[receiving/run_receiving.py](receiving/run_receiving.py):

```sh
/usr/bin/python3 /Users/me/household-filter-independent-18a24bf0c281-runtime/receiving/run_receiving.py --variant original --run independently-requested-original
/usr/bin/python3 /Users/me/household-filter-independent-18a24bf0c281-runtime/receiving/run_receiving.py --variant candidate --run independently-requested-candidate
```

Existing evidence directories are not reused. No further run is required for
this acceptance. Query-length/refusal coverage, the author's import/retry path,
other transports and a full project-test rerun are outside this independent
matrix. This packet adds only uniquely prefixed evidence for the owner handoff.
