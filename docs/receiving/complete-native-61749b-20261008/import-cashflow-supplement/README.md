# Household imported cashflow receiving supplement

**Accepted: one composed native workflow, two sequential Node processes, 15 explicit check groups.** The receiving source is commit `07e223b5da19cea0f048219d8c85689fcc1ba83f`, tree `76cd2cc60b10dabdd301d32a53da4b833015193d`. This supplement leaves the existing 88-path canonical proposal and all original source and evidence unchanged.

## Receiving boundary

The original import evidence already demonstrates exact CSV retries after a process restart, and import serialization alongside native record and denominated-budget writes. Its authored HTTP tests also query a monthly summary. Inspection of the retained import harnesses found no call that consumes imported categorized transactions through `cashflowTrend` or the `cashflow_trend` tool. The existing cashflow tests exercise its own native transaction inputs. This supplement qualifies the composed domain workflow once, without repeating those suites.

The implementation uses the native JSON `LedgerStore`. Categories are explicit required CSV inputs. The case calls the unchanged public exports `previewTransactionImport`, `commitTransactionImport`, `LedgerStore.update/load`, `recordTransaction`, `setBudget`, `monthlySummary` and `cashflowTrend`.

`fixture.csv` contains seven synthetic categorized transactions in February and April 2026. An earlier native CHF transaction and its January budget establish existing state that must survive the import. After the import, five explicit Food budgets are assigned across USD and EUR, including a USD budget in empty March. A second, distinct Node process reopens the same saved ledger, reads both reports, replays the original exact CSV and original preview token, then reads both reports again.

## Numerical oracle

Amounts are integer minor units; no exchange conversion is performed.

| Currency and month | Income | Expense | Net | Cumulative interval net |
| --- | ---: | ---: | ---: | ---: |
| USD, February | 300000 | 102500 | 197500 | 197500 |
| USD, March | 0 | 0 | 0 | 197500 |
| USD, April | 300000 | 11250 | 288750 | 486250 |
| EUR, February | 0 | 2500 | -2500 | -2500 |
| EUR, March | 0 | 0 | 0 | -2500 |
| EUR, April | 0 | 3500 | -3500 | -6000 |

USD interval income is 600000, expense 113750 and net 486250. EUR interval income is zero, expense 6000 and net -6000. The out-of-period CHF record is preserved and does not enter either selected report.

The Food budget remaining amounts are USD 2500 for February, USD 5000 for empty March and USD -1250 for April; EUR -500 for February and EUR 500 for April. The corresponding over-budget flags and exact category income/expense cells are checked in both the monthly and cashflow results.

Reopened replay returns zero additions and seven original recordings. The preview's all-row totals retain the original batch values while its additions totals are empty. Monthly totals, category spending, budget overage and cumulative cashflow remain exact after replay. Every original transaction field, including identity and creation time, every budget, JSON bytes, inode, modification time and original CSV bytes remain unchanged through reopened reads and replay. The raw saved JSON and both phase results are retained.

## Runtime and custody

The receipt records Node `v24.19.0` on Linux, TypeScript `5.9.3`, and a strict compile of the four native domain modules with zero diagnostics. TypeScript matches the owner's locked version. The available Node declarations are `25.9.5`, while the owner's lock contains `24.19.1`; this is an explicitly scoped dependency compile, not a replacement full-project typecheck or lockfile installation. All 188 compiler inputs are pinned in `run/compile.json`.

The generated JavaScript bodies reconstruct the original independent native receipt's exact four compiled hashes by appending only the standard `sourceMappingURL` comment. `original-runtime-body-custody.json` records that comparison. Runtime source was not patched or replaced. `run/receipt.json` verifies all 88 previously proposed paths before and after execution against the frozen publication manifest.

No MCP transport, browser, bank account, production ledger, cross-process concurrent writer, installation or deployment was exercised. Processes run sequentially, within the store's declared one-process-per-ledger usage. The content token remains a CSV content binding, not authentication or a durable approval receipt.

## Evidence and reproduction

`review.json` records the disposition and source/receipt pins. `gap-analysis.json` identifies the retained original coverage and the reason for this one additional workflow. `expected.json` is the numerical and row oracle. `workflow.mjs` is the complete native receiver. `run/initial.json` and `run/reopened.json` contain its raw results; `run/receipt.json` contains actual commands, exit statuses, process IDs and overall custody. The original proposal and its evidence have not been copied into or changed by this supplement.

The recorded invocation was:

```sh
NODE_DISABLE_COMPILE_CACHE=1 /opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin/node /workspace/scratch/61749b0088e2/household-import-cashflow-supplement/run.mjs
```

The runner refuses to overwrite its retained `run` directory. A reviewer can use a separate empty output directory with `emitted`, `state` and `tmp` subdirectories and run the exact three child commands recorded in the receipt, changing only their output-directory argument. The compile script reads the documented already-installed compiler and Node declaration paths; it performs no dependency download.
