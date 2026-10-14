# Saved-month discovery: original and author evidence

This is the author record for Household Ledger issue39, based on unchanged complete PR8 `591ab6f5a2d65bf596aeb707dbb635ee981ec926`. Four new product files add a saved-ledger month discovery command. The existing validator, Store, MCP registration, package and workflow are unchanged.

The public 7,454-byte contract was frozen and published as Git blob `13ced38ba385f12d8f9c7261371238564420c6c8` before any candidate implementation. The original complete parent tree has none of the four paths. The actual original missing-command invocation exited 1 with `MODULE_NOT_FOUND`, empty stdout and all six absence/preservation checks satisfied. It did not execute any ledger operation. Authored mixed and compatible saved ledgers were frozen at that point.

## Actual author results and a retained reporting mistake

Node 24.19.0's standard `node:module.stripTypeScriptTypes` transformation produced an isolated JavaScript module from the exact original `src/ledger.ts`. Its experimental warning is retained. The source's Git identity is checked before the transformation; this is not a TypeScript typecheck, compiler-version equivalence proof or full parent build.

The focused `node --test test/ledger-months.test.mjs` command exited 0. Its complete spec-reporter output records 11 passed tests, zero failed, skipped, cancelled or todo tests. It includes actual CLI admission/provenance/error cases, 16 MiB boundary, 100,000 combined-row boundary, `/dev/full`, and a discovered month passed to the unchanged native monthly summary.

The separate retained mixed-ledger CLI also exited 0 with empty stderr. It reports four exact keys: `0000-01`, `1969-12`, `2026-10`, `2026-12`, with four transaction occurrences and five budget occurrences. The unknown months between those keys are not generated. All offered source, original fixtures and preparation controls retain exact bytes/modes.

**The outer author receipt remains `accepted:false`.** The controller expected TAP summary prefixes such as `# pass 11`, while Node emitted its default spec prefix `ℹ pass 11`. The separate `classification-review-v1.json` reads those complete retained bytes and accepts the actual 11-test scope; it does not edit the raw receipt, rerun the product or substitute an independent peer review. The initial read-only audit command also contained a Python reserved-keyword syntax error and executed no statements; its corrected audit read the same existing output without a product call.

Independent receiving and source review are separate evidence, with their own inputs and outcomes. Nothing in this author record claims native installation, a full npm suite, SDK/HTTP transport, real financial records, source adoption or successful use by a household.

## Ordinary use

Use the maintained `docs/LEDGER_MONTHS.md` guide and the parent's existing build, then:

```sh
node tools/household-months.mjs --ledger /path/to/your/saved-ledger.json
```

The result supplies only recorded keys, occurrence counts and currency availability. Select the intended month/currency explicitly for the existing consumer; the calendar-year flag alone does not qualify mixed or legacy budgets for a monthly calculation. Redirect output only to a distinct path, never the input.

The retained controllers use exclusive output directories to protect their historical records. Reproduction requires a fresh copy/stage; do not rerun them over these retained paths.
