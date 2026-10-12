# Run the packaged Household Ledger locally

This package contains the complete existing Household Ledger MCP service from
[PR8 at 591ab6f5](https://github.com/Jacob-Met/household-ledger-mcp/pull/8), its
compiled JavaScript and locked runtime dependencies. It is ready for a local
MCP client that launches a process through stdin/stdout. Node.js 20 or newer
must already be installed. No npm install is needed to run the extracted package.

## Connect a local client

Extract the archive into a directory you want to keep. Choose an explicit ledger
filename in a writable directory, then configure the client's MCP server:

```json
{
  "mcpServers": {
    "household-ledger": {
      "command": "node",
      "args": ["/absolute/path/household-ledger-mcp/dist/src/stdio.js"],
      "env": {
        "HOUSEHOLD_LEDGER_DATA_PATH": "/absolute/path/household-data/ledger.json"
      }
    }
  }
}
```

Replace both paths with your own absolute paths. JSON paths on Windows can use
forward slashes. The entrypoint can run from another working directory. It
writes protocol messages to stdout; the client manages the child process.

Use one running service process per ledger file. The existing stdin entrypoint
is for local process-spawned development. When several clients need the same
ledger, use the existing shared loopback HTTP service described in `README.md`.
This package does not install a background service or change client settings.

## Import a reviewed CSV and inspect its cashflow

The eight tools are `record_transaction`, `list_transactions`,
`preview_transaction_import`, `commit_transaction_import`, `monthly_summary`,
`cashflow_trend`, `set_budget` and `get_budgets`.

1. Give `preview_transaction_import` the complete CSV text in its `csv` field.
   Review the returned normalized rows, matches/conflicts and separate currency
   totals. The required headers are `idempotencyKey,type,amountMinor,currency,date,category`;
   an optional `note` column preserves literal text, including quoted commas and
   newlines. Amounts are positive integer minor units.
2. After reviewing, call `commit_transaction_import` with the same exact CSV and
   its returned `reviewToken`. The service rechecks current recording keys and
   admits the complete batch together. Repeating identical input returns the
   original recordings without adding duplicates.
3. Set an explicit monthly category limit with `set_budget`, for example
   `{"category":"groceries","month":"2026-10","limitMinor":4500,"currency":"USD"}`.
4. Call `monthly_summary` with `{"year":2026,"month":10,"currency":"USD"}` or
   `cashflow_trend` with
   `{"fromMonth":"2026-10","toMonth":"2026-12","currency":"USD"}`.
   Cashflow includes empty months, category spending, budgets and cumulative net
   from the beginning of the interval. Cumulative net is not an account balance.
   Select each currency separately; the service performs no conversion.

The original `docs/TRANSACTION_IMPORT.md`, `docs/CASHFLOW_TREND.md` and
`SUMMARY_CURRENCY.md` retain the full source contracts. These examples use
explicit fictional values and dates.

## Receive the package with synthetic data

The included standard-library Python consumer launches the actual packaged
stdin MCP entrypoint twice in sequence. It creates its own eight-row CSV and
ledger, imports through the protocol, checks explicit USD/EUR budgets and three
calendar months, then reopens the ledger and retries the original import. It
retains raw JSON-RPC exchanges, stdout/stderr and a JSON receipt.

```sh
python3 tools/receive-packaged-stdio.py \
  --package /absolute/path/household-ledger-mcp \
  --work-dir /absolute/path/new-household-receiving
```

The receiving directory must be new and its parent must exist. The receiver
does not use a household's actual ledger. `--node /absolute/path/to/node` selects
an installed runtime when needed. `tools/stdio-package-expected.json` records
the literal numerical expectations separately from the service implementation.

## Rebuild the delivery from the pinned source

The regular source workflow still uses the unchanged `package.json`, lockfile,
TypeScript configuration and product files. After installing the locked
dependencies and building, prepare a new package filename:

```sh
npm ci --ignore-scripts --no-audit --fund=false
npm run typecheck
npm run build
python3 tools/package-local-mcp.py \
  --source . \
  --source-manifest SOURCE-MANIFEST.json \
  --output ../household-ledger-local.tar.gz
```

`--offline` can be added to `npm ci` when the exact dependency cache is already
available. The packager verifies every source file against the supplied manifest,
includes existing compiler outputs and each locked runtime dependency's original
files, and refuses an existing output filename. Development-only packages are
excluded from the runtime archive. It starts no process and reads no ledger.

`SOURCE-MANIFEST.json` identifies the unchanged 28 product, build, test and usage
files needed by this package. `PACKAGE-MANIFEST.json` fingerprints every delivered
file and records runtime package versions and lock integrity values. The pinned
PR retains the full 116-path historical source and evidence tree. ce7 retains
source-parent integration and 61749 retains canonical/sibling receiving; this
local package supplements their existing source handoff.
