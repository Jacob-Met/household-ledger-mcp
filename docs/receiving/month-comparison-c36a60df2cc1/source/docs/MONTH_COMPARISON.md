# Compare two saved Household Ledger months

Create one offline HTML report from an explicitly selected ledger file, two distinct months, and one currency. The report puts the existing native monthly totals, every participating category, and qualified budgets side by side. It does not require the MCP server or an account connection.

## Run

Build the project using its existing locked TypeScript toolchain, then run:

```sh
node dist/src/household-compare.js --ledger /path/to/ledger.json --first 2026-08 --second 2026-09 --currency USD --out /existing/folder/august-september.html
```

All five options are required. The output parent must already exist and the output file must be new. Use `--help` alone for usage. Open the resulting HTML file in a browser or print it; it contains its styles and data and does not need JavaScript or network resources.

`first` and `second` retain the order you entered, including a reverse chronological comparison. Every displayed change is **second minus first**. For example, expense 20000 followed by 15000 gives a change of -5000 minor units. The tool does not choose adjacent months automatically.

## What the comparison means

Amounts remain exact integer minor units with the explicitly selected three-letter currency. No decimal denomination or currency conversion is assumed. Monthly net cash flow is recorded income minus recorded expense; it is not an account balance. Budget remaining is the native budget limit minus recorded expense.

The complete category union includes income-only categories, categories that appear in only one month, and categories that appear only in budgets. Original category names, case and spaces remain distinct. The order is deterministic JavaScript string order, without locale folding. Names containing markup are displayed as text.

A missing transaction category has zero recorded activity in that selected summary. A **missing budget** is different: it appears as **Absent**, not as a zero limit. A present zero budget remains zero. Limit, spent and remaining changes are **Not comparable** unless both months have one qualified native budget for the exact category.

Monthly source amounts remain numbers in the embedded inspection record. Every difference is a decimal string computed by converting each operand to BigInt before subtraction. This preserves a change such as 18014398509481982 even though each month separately fits JavaScript's safe integer range. Missing budget-pair differences are null. Percentage changes are not calculated.

Legacy budgets retain the absence of a stored currency. If the native monthly summary qualifies one through its existing single-transaction-currency context, the report identifies that legacy context. It does not relabel the row as explicitly denominated. Multiple native budget rows for one exact category in a selected month refuse the comparison before output; no row is silently chosen or overwritten.

## Input admission and source custody

The CLI opens the explicit input once, read-only, and requires a regular file. It captures the complete bytes through that descriptor and refuses a size or write-metadata change during the read. An atomic replacement of the pathname does not turn the already captured descriptor into a later snapshot. The report names the selected source, byte count, SHA-256 and generation time; it is a review of those captured bytes.

The complete JSON ledger is validated by the unchanged `validateLedgerData` before two calls to the unchanged `monthlySummary`. It is not prefiltered by month or currency. Thus invalid data outside the requested selection and the producer's unresolved legacy-budget or unsafe-gross-total conditions still refuse. A missing source file is an error; the command does not use Store.load's empty-ledger fallback.

Inputs must contain 1–8,388,608 bytes of complete UTF-8 JSON. One leading UTF-8 BOM is accepted and remains part of the source hash. Both months must be in the native range 1970-01 through 9999-12 and must differ. The complete category union is bounded to 5,000 categories, and the complete HTML to 16,777,216 UTF-8 bytes. An over-limit report refuses rather than truncates. Selected names containing NUL or an unpaired surrogate refuse because HTML cannot retain those code points losslessly.

All admission, arithmetic and rendering finish before publication begins. A unique temporary file in the selected output directory is exclusively created with private mode 0600 where supported, then completely written, synced and closed. An exclusive hard link publishes those completed bytes at the requested new destination. The owned temporary name is removed on success or failure. Existing output files and the selected source are never replaced, and an interrupted write does not expose a partial report at the final destination. The destination filesystem must support this hard-link operation; there is no overwrite or partial-file fallback. A cleanup failure may leave an owned temporary file or an already completed report, identified on stderr. No crash-durability or cross-process ledger lock is claimed.

The report contains selected category totals and budget information, plus an inert `application/json` inspection record with schema `household-ledger-month-comparison/1`. It does not include the raw ledger, individual transaction notes, or a restorable ledger file.

## Exit status

| Status | Meaning |
| --- | --- |
| 0 | The complete report was written, synced and closed, or help was displayed. |
| 2 | Arguments, input reading, native validation, comparison or complete rendering refused. No output is created. |
| 1 | Output publication or cleanup failed. No success is printed; stderr identifies an owned temporary file or already completed report if one may remain. |

## Maintained receiving

After building, the focused native tests are:

```sh
node --test dist/test/month-comparison.test.js dist/test/month-comparison-cli.test.js
```

To create and check a fully fictional example through the actual command:

```sh
node tools/check-month-comparison.mjs /existing/NEW-receiving-directory
```

The receiving directory must not exist. The command retains a fictional ledger, the actual HTML report, CLI logs and receipt. It checks native producer controls, manually specified totals/category/budget differences, and original source byte/inode/write-time preservation. This native consumer check is separate from actual browser and print receiving.

## Source and ownership

This is an additive consumer contribution over the source exposed by [draft PR8](https://github.com/Jacob-Met/household-ledger-mcp/pull/8) at `591ab6f5a2d65bf596aeb707dbb635ee981ec926`. Its unchanged `src/ledger.ts` Git blob is `2ff8133404f19c705eb7b7f0a943e8190f3328d6`. The project scope is recorded in [issue3 comment6067214316](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6067214316).

`estate-ce7eb129730f` retains parent integration and `estate-61749b0088e2` retains canonical receiving and the active sibling composition. The existing cashflow_trend, budget-copy, transaction filters, CSV import/export and single-month report keep their source and ownership. This contribution adds six source/test/tool/document paths; domain, Store, MCP registration, existing dependencies and existing source files are unchanged.

An isolated dependency projection is used for the retained native receiving. It is not a complete canonical history or an installed service. Owner integration must apply the additive paths to the actual accepted source, retain the existing source and repository gates, and requalify relevant dependency drift.
