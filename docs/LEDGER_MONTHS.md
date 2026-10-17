# Find a month before reviewing a saved ledger

Use this small offline command when you have a saved Household Ledger JSON file but do not know which months contain recorded transactions or budgets.

From the complete source tree, use the existing Node.js 20+ build:

```sh
npm ci
npm run build
node tools/household-months.mjs --ledger /path/to/ledger.json
```

The command prints complete JSON to your terminal. It does not start the MCP server, record a transaction, contact an account or write any file. The file must already exist. You may save stdout to a **different, new path** if you want a copy; never redirect into the ledger itself because the shell would truncate it before this command starts.

```sh
node tools/household-months.mjs --ledger /path/to/ledger.json > discovered-months.json
```

## Read the result

`months` is ordered from the earliest to the latest exact recorded `YYYY-MM` key. A row exists only if that key appears in a transaction date or a budget. The command does not fill missing months or infer that a month with no row had no household activity.

Each row shows:

- `transaction_count`: saved transaction occurrences, including repeated IDs.
- `budget_count`: saved budget occurrences, including allowed repeated legacy rows.
- `unassigned_budget_count`: budgets whose currency is absent. They do not become an invented currency group.
- `currencies`: alphabetically ordered currency codes, normalized in the same way as the existing monthly summary. Each group gives transaction, income, expense and explicitly denominated budget occurrence counts.
- `summary_supported`: whether the recorded year is in the existing monthly summary's 1970–9999 argument range. This is only a calendar-year check.

Budget-only months remain visible. A month with only unassigned legacy budgets has an empty `currencies` array. The inherited validator also admits some keys outside the monthly summary's year range, including legacy budget `0000-01`; discovery preserves those keys and marks the calendar flag false. It does not repair or drop them.

For example, a row with `month: "2026-06"` and a `USD` group gives you an explicit month and currency to consider in the existing `monthly_summary` tool or saved-month comparison. Deliberately select the month you intend to review. The existing consumer still applies all its own rules: mixed-currency or unassigned-budget combinations may refuse even when the year flag is true. Counts here are not monetary totals, balances, unique purchases or proof that an account is complete.

`source.path` retains exactly the path argument you supplied. `source.bytes` and `source.sha256` identify the complete saved file read for this result. The report contains no original transaction IDs, notes, categories or amounts. It does not preserve the whole ledger or substitute for a backup.

## Refusal and recovery

`--help` alone prints usage and exits 0. Normal results also exit 0, including a valid empty ledger. Ordinary invalid arguments, missing/nonregular inputs, invalid UTF-8/JSON/native ledger data, resource limits and output-write errors exit 2 with a diagnostic on stderr.

The command requires a regular file and allows an ordinary symlink to one. It reads at most 16 MiB plus one refusal byte and accepts at most 16 MiB. The complete unchanged native validator runs before any projection; a malformed neighboring row fails the entire request. After native validation, the combined transaction and budget count must be at most 100,000. Admission failure emits no partial result.

There is no output-file publication or overwrite logic: stdout belongs to the caller. If the output sink fails, part of the JSON might already have been written. Inspect or discard that incomplete destination and deliberately rerun to another destination after correcting the cause. The input is never repaired or initialized. Stop other writers when you need a stable comparison; a successful read is not a concurrent-writer snapshot guarantee.

## Focused maintenance check

After the ordinary parent build:

```sh
node --test test/ledger-months.test.mjs
```

The test file covers literal month/currency/count output, empty and legacy data, complete validation, admission limits, real CLI provenance/refusal and a discovered month passed to the unchanged native monthly summary. The `/dev/full` output-failure control is platform-specific and skips where that device is unavailable. The file-symlink control requires ordinary symlink creation permission.

## Maintenance scope

The offline helper reuses the native ledger validator. It does not change Store,
schema or MCP behavior. `npm test` runs both the compiled TypeScript suite and
the focused saved-month tests after the ordinary full TypeScript build.
Historical qualification archives describe their original source state; use the
current source and CI checks to verify this implementation.
