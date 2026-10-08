# Household Ledger: reviewed monthly budget copy

This is the qualified, 18-path contribution for [Household Ledger issue #5](https://github.com/Jacob-Met/household-ledger-mcp/issues/5). It lets a household review explicitly denominated category budgets and deliberately carry the selected limits into another month through the existing MCP service.

## Exact receiving identity

| Item | Identity |
| --- | --- |
| Native source head | `2b77b81ad59c5f3255aa25c37110e91d3bad6a01` |
| Native source tree | `940438aed7af43d841ff7700da8bd4f83a838afd` |
| Sole accepted native parent | `07e223b5da19cea0f048219d8c85689fcc1ba83f` |
| Parent tree | `76cd2cc60b10dabdd301d32a53da4b833015193d` |
| Independent review SHA-256 | `43ece60475294bbc667ab47f4ec2815b9cb1872e866a567704b90ea79c6974a0` |
| Exact patch receiving receipt SHA-256 | `2efcf1885508f151cfce8e1cda1deceea3334774a035a7908bde83d8019ac077` |

The complete bundle preserves the accepted **native executable snapshot ancestry for reproduction**. It is not canonical main history. ce7 and receiver `estate-61749b0088e2` retain canonical integration; ce7/e3/401c/566d/a219 retain the accepted source attribution. This receiving publication does not merge implementation into main, change a deployed service or touch a live household ledger.

The complete predecessor packet is already published at [receiving commit d821d8ce](https://github.com/Jacob-Met/household-ledger-mcp/tree/d821d8ce749d22568514efb4eb4dd25e5cdfbf06/docs/receiving/household-complete-07e223b5-31a349052b90), under the [existing owner handoff](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6061606897). It reconstructs the exact 83-file parent used here.

## Household behavior

`preview_budget_copy` takes an explicit source month, a different destination month, one currency and an optional category selection. It returns the reviewed source and destination values and a content-bound review token without writing. Existing matching limits are displayed as already present. Conflicting or unassigned destination budgets prevent a commit-ready review.

`commit_budget_copy` accepts the exact returned `review` and `reviewToken`. Inside the unchanged serialized LedgerStore, it rechecks every selected source and destination before staging additions through the unchanged `setBudget`. One stale or conflicting row refuses the entire copy. Existing matching limits and unrelated transactions, recording keys, currencies and months are preserved. Zero limits and literal Unicode category names are supported.

For example, preview with:

```json
{"fromMonth":"2026-10","toMonth":"2026-11","currency":"USD","categories":["groceries","transport"]}
```

Inspect the returned rows, then explicitly call `commit_budget_copy` with the complete returned review and token. Full input limits, examples and refusal semantics are in `docs/BUDGET_COPY.md` in the restored source.

### Replay boundary

A repeat with the same selected source values and matching current destinations adds zero budgets and makes no file write, including after a new service process starts. Changed or missing sources still refuse even when destinations all match.

The review token binds content; it is not authentication, human-approval evidence or a durable history of plan execution. If the original review saw an absent destination, that destination may be added again when it is currently absent. A destination that was already present in the original review must remain present. The existing process-local writer queue remains the concurrency boundary; no cross-process writer guarantee or schema migration is added.

## What is preserved

There are 97 tracked source files. All 79 unaffected parent entries, including their raw Git blobs and modes, remain exact. Only four prior files change: additive tool import/list/dispatch in `src/index.ts`, two expected catalogue lists in existing tests, and README usage. New files contain the budget-copy module, 14 Store controls, three real HTTP controls, usage and exact evidence.

`src/ledger.ts`, every prior handler, recording/idempotency, summaries, denominated budgets, cashflow, CSV import, dependencies, lockfile and prior behavioral assertions remain unchanged. The Mac qualification checkout has one deliberately untracked read-only dependency symlink; the original freeze and explicit status correction are both retained. The ThinkPad reconstruction has empty tracked and untracked status.

## Receiving the contribution

1. Check the archive checksum supplied with its published handoff, then extract it into a new directory. `MANIFEST.json` binds every payload file.
2. The complete source bundle in `source/` can be cloned into an isolated review directory. Its advertised branch is `astra/household-budget-copy-20261008-a0eb`. Verify native head, parent and tree against the table above.
3. For an owner already receiving exact native parent `07e223b5`, `source/budget-copy-after-owner.patch` and the incremental bundle contain only this contribution. The recorded private-index application of that patch produces exact tree `940438ae`.
4. For an advanced canonical receiving source, preserve the existing owner composition and apply/review the same 18-path delta there. Do not merge this native snapshot ancestry or this artifact-only branch wholesale into canonical main.

The qualification does not require repeating settled suites merely to read this packet. If receiving source semantics change, qualify that actual changed source. The existing project test command is `npm test`, with the project’s original locked dependencies.

## Executed evidence

- Original native HTTP control: all eight prior tools worked; the two new names were unknown; the fictional ledger bytes stayed unchanged.
- Native TypeScript candidate: **118 passed, zero failed/skipped** — all 101 inherited tests plus 14 new Store and three real HTTP tests. This includes fresh-process no-write replay, competing writes, source/destination drift, atomic rename failure, malformed/oversized inputs and literal category identities.
- Independent real-Store challenge: **one passed, zero failed/skipped**. After a successful copy, changed and then removed sources refused without any write attempt, while exact bytes, mtime, inode and an unrelated later recording remained intact. The disclosed current-value recreation boundary and subsequent zero-write repeat also passed.
- Receiving: all 97 frozen source files/raw Git blobs/modes and all 79 unaffected parent entries verified. Applying only the patch to a private index at the accepted parent produced the exact frozen tree. No native runtime suite was repeated for source transport.

The independent packet is copied verbatim under `evidence/independent/`, including its own manifest, source/emit binding, probe, log and result. Producer evidence and source-receiving records remain separately attributed.

A failed initial bundle command using only a raw SHA positive endpoint is retained as a **packaging setup failure**. The corrected named-branch bundles both verify. It was not a product test failure and did not alter source.

No live ledger, financial/provider account, paid API, native goal, deployment or runtime configuration was used or changed. This is an external source contribution by `chatgpt-a0eb505c4971/estate_products` under Jacob’s standing mandate.
