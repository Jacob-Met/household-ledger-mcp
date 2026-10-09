# Preview a household expense plan

Compare one recorded ledger snapshot with the same month after adding declared planned expenses. The command produces a self-contained HTML report for local review or printing. It never records transactions, changes limits or starts the MCP server.

```sh
npm run build
node dist/src/household-plan.js --ledger /path/ledger.json --plan /path/plan.json --month 2026-10 --currency USD --out /existing/folder/new-preview.html
```

All five options are required. Both input files and the output parent must exist; the output must be new. Use `--help` alone for usage. The existing build emits the explicitly invoked CLI; no package binary, MCP registration or dependency is added.

## Plan format

```json
{
  "schema": "household-expense-plan/1",
  "expenses": [
    {"date": "2026-10-20", "category": "food", "amountMinor": 7500, "note": "Groceries to consider"},
    {"date": "2026-10-21", "category": "travel", "amountMinor": 12000}
  ]
}
```

Each occurrence requires `date`, `category` and `amountMinor`; `note` is optional. Unknown root/item fields refuse, including type, currency, recording IDs and idempotency keys. Every item is an additional expense in the selected currency. Identical rows count separately. An empty array gives an explicit zero-addition comparison.

Native admission remains authoritative: positive safe integer minor units, nonblank trimmed categories, exact literal notes, and an uppercased three-ASCII-letter currency. No ISO whitelist or conversion is added. Each real calendar date must fall in the selected month, which must be in the native summary range 1970-01 through 9999-12.

## Reading the report

The report separates recorded values, planned additions and hypothetical values. It shows all participating categories, every applicable native budget row and every declared occurrence. Missing budgets remain absent; a present zero limit remains zero. Repeated legacy budget rows are retained separately. Equality with a limit is within it; only a strictly greater expense is over.

Historical category spellings remain exact, including whitespace and Unicode differences. Planned categories use native trimming. The report identifies occurrence positions and qualified legacy unassigned-budget context. The recorded summary must qualify before additions: planned expenses cannot establish missing currency context for an empty or mixed-currency legacy month. Complete ledger validation includes unselected months/currencies. Native malformed-input and unsafe-total refusals remain in force.

Monthly net is income minus expenses, not an account balance. The calculation describes only the declared additions in the existing model, not actual future spending. Budget allowance and recorded income remain unchanged. No persistent transaction identity or commit action is produced.

## Input capture and exclusive delivery

Each input is captured separately through one read-only descriptor. It must be a regular file containing complete UTF-8 JSON. One leading UTF-8 BOM is accepted and remains in the source hash. A size or write-metadata change during capture refuses.

Only the first captured bytes determine the report. The complete report is written, synced and closed at a new private temporary name in the destination directory. Immediately before final delivery, both input paths are reopened and their device/inode, size/write metadata and complete bytes are compared with the original capture. Changed, replaced, missing or unreadable inputs refuse; the temporary file is removed and no final report is created. The command does not recapture and recompute a different preview.

An exclusive hard link creates the final destination from the completed temporary file. Existing files, directories, symlinks and hard-link aliases are not overwritten. The owned temporary name is removed after success or failure. A cleanup error names any remaining temporary file or already delivered complete report on stderr.

This delivery-time check is not a writer lock or an atomic two-file snapshot. A source can still change after the final check. Both captured byte counts, SHA-256 values, selected paths and generation time are visible in the report. It is not a live or automatically refreshed view. The destination filesystem must support hard links; no crash-durability guarantee is made.

The inert inspection record has schema `household-expense-plan-preview/1`. It contains the comparison, planned notes and source identities, not the full ledger or prior transaction notes/keys/IDs. There is no active script, network resource or browser-storage operation. Ordinary CR/LF strings remain literal. NUL-containing strings and unpaired surrogates use visibly labeled reversible JSON string notation rather than silent replacement.

## Whole-result limits and exit status

| Input/result | Limit |
| --- | --- |
| Ledger | 1–8,388,608 bytes |
| Plan | 1–1,048,576 bytes |
| Planned occurrences | 0–500 |
| Category union | At most 5,000 |
| Complete HTML | At most 16,777,216 UTF-8 bytes |

Exceeding a limit refuses the entire result; no prefix is presented as complete. Exit 0 means complete delivery or standalone help. Exit 2 means argument, source, native calculation, rendering or final source-confirmation refusal. Exit 1 means publication/cleanup failure. Failure prints no success. A cleanup error can follow complete delivery; its diagnostic explicitly names that destination.

## Native receiving and ownership

```sh
node --test dist/test/expense-plan.test.js dist/test/expense-plan-cli.test.js
node tools/check-expense-plan.mjs /existing/NEW-receiving-directory
```

The maintained receiver runs the actual compiled CLI on fictional inputs and retains the report, process logs and receipt. It checks hand-specified totals, budget crossings, occurrence/note fidelity, source custody and existing-output refusal. That result is separate from actual browser/print receiving.

[Issue 14](https://github.com/Jacob-Met/household-ledger-mcp/issues/14) reserves these six additive source/test/tool/document paths over receiving PR8 `591ab6f5a2d65bf596aeb707dbb635ee981ec926`. Ledger/Store, HTTP/stdio, existing clients/tests, package/lock/config and workflows retain their source and owners. Delivery follows the ce7 source-parent and 61749 canonical receiving route; it does not adopt native snapshot ancestry or deploy a service.
