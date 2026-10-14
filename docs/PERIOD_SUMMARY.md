# Review a recorded pay period

The period-summary command reports income, expenses and category totals for an
explicit inclusive date range. The range can cross calendar months—for example,
January 20 through February 19. It reads one saved ledger and leaves it unchanged.

Amounts are exact integer minor units in the currency you select. Net is recorded
income minus recorded expense. It is not an account balance, a forecast or a claim
that the saved file contains every transaction. The command does not allocate
monthly budgets to a partial period or estimate spending for missing days.

## Run from the source offer

Use the complete qualified Household Ledger source with this four-file addition.
The source route requires an existing Node version that supports TypeScript
transformation; the receiving runtime for this offer is Node **24.19.0**. It
imports the unchanged `src/ledger.ts` directly. No dependency installation,
compiler, MCP server, client configuration or service is required for this command.

```sh
node --experimental-transform-types tools/household-period-summary.mjs \
  --ledger "/path/to/saved-ledger.json" \
  --from 2026-01-20 --to 2026-02-19 --currency USD
```

For the complete machine-readable result, add `--json`:

```sh
node --experimental-transform-types tools/household-period-summary.mjs \
  --ledger "/path/to/saved-ledger.json" \
  --from 2026-01-20 --to 2026-02-19 --currency USD --json
```

Output goes to stdout. If you choose shell redirection, the shell controls the
destination and can truncate an existing file; this command does not provide an
output-file publication operation. `--help` alone reads no ledger. A pathname `-`
means a file literally named `-`, not stdin. Quote paths and currency arguments
according to your shell. Node may emit its TypeScript-transform experimental
warning to stderr; the retained original observation includes that warning.

`--ledger`, `--from`, `--to` and `--currency` are each required exactly once.
`--json` is optional and may appear once. Unknown, duplicate or positional
arguments refuse. There is no environment-selected ledger, implicit date range,
default currency, pagination, category filter or write mode.

## What the result means

Both endpoint dates are included. Dates use the existing ledger validator's real
four-digit Gregorian calendar-date rules. A reversed range refuses. Currency
uses the existing convention: trim surrounding whitespace, require three ASCII
letters and uppercase. This checks the code's shape; it is not a currency
registry or an assumption that all currencies have two decimal places.

The complete original ledger is admitted before selection. An invalid transaction
or budget outside the range still refuses the result. Every matching transaction
occurrence contributes, including repeated legacy rows and duplicate IDs. No
duplicate inference or removal occurs.

Category labels remain exactly as saved. `Food`, `Food ` and `food` are distinct.
Leading whitespace, Unicode and reserved object-key names such as `__proto__`
are retained safely in an array. Category order is JavaScript UTF-16 lexical
order, independent of the machine's locale. Text output uses JSON quoting for
labels so embedded line endings and control characters remain visible without
becoming terminal commands or additional report lines.

Each summary contains:

| Field | Meaning |
| --- | --- |
| `format`, `version` | `household-period-summary`, schema version 1 |
| `from`, `to`, `currency` | Exact admitted dates and normalized selected code |
| `counts.transactions` | Number of matching saved occurrences |
| `counts.income`, `counts.expense` | Occurrences in each native direction |
| `totals.incomeMinor`, `expenseMinor` | Exact selected gross amounts |
| `totals.netMinor` | Income minus expense, in the same denomination |
| `categories` | Every selected literal label, with its counts and three amounts |

An empty selection has an empty category array, zero counts and zero totals. The
requested currency remains explicit. A budget-only month is still an empty
transaction result. Budgets are validated but are neither evaluated nor included
in this output; existing monthly budget reports retain their separate meaning.

The JSON CLI envelope is two-space JSON followed by one LF:

```json
{
  "source": {
    "path": "/absolute/path/to/saved-ledger.json",
    "bytes": 1234,
    "sha256": "lowercase SHA-256 of the complete captured file"
  },
  "summary": {
    "format": "household-period-summary",
    "version": 1,
    "from": "2026-01-20",
    "to": "2026-02-19",
    "currency": "USD",
    "counts": {"transactions": 0, "income": 0, "expense": 0},
    "totals": {"incomeMinor": 0, "expenseMinor": 0, "netMinor": 0},
    "categories": []
  }
}
```

The example above illustrates the shape, not a received household result. The
source path, byte count and digest identify the captured file; they do not prove
its authenticity, completeness, account status or ordering relative to another
snapshot. No generation timestamp is invented. Notes, IDs, retry keys, creation
times, unrelated currencies and unknown ledger metadata do not enter the summary.

## Arithmetic and bounds

Positive native amount integers are accumulated using BigInt. Complete gross
income and complete gross expense must each fit in the safe integer range,
0 through **9,007,199,254,740,991**. Large income and expense cannot cancel their
way past a gross-total refusal. Admitted totals and signed net are returned as
exact ordinary JSON integers; zero is positive zero. There is no floating-point
rounding, conversion, percentage, pooled-currency total or inferred denominator.

| Boundary | Complete result or refusal |
| --- | --- |
| Raw CLI input | At most 8 MiB, inclusive |
| Original transaction rows | At most 100,000 |
| Original budget rows | At most 100,000 |
| Selected literal categories | At most 5,000 |
| Pretty JSON API summary including LF | At most 4 MiB UTF-8 |
| Final CLI JSON or text including LF | At most 4 MiB UTF-8 |

The API summary ceiling and final CLI ceiling apply separately; the CLI's source
envelope adds bytes. No partial row set, shortened category list or truncated
successful output is produced. The raw-file limit applies before JSON parsing;
the API row and summary limits apply to the complete supplied object.

## Ordinary-file and stream behavior

The CLI requires an existing regular file and refuses an observed final symlink,
directory, device or missing entry. Missing input stays missing. It captures at
most 8 MiB through an opened descriptor, compares identity, size and modification
time around the read and against the named entry, and closes the descriptor before
parsing or output. UTF-8 decoding is strict; a BOM remains in the decoded text and
therefore fails JSON parsing. Invalid JSON is not repaired.

This is an ordinary consistency check, not a file lock, a hostile-directory race
guarantee or an atomic snapshot across concurrent writers. The command does not
construct `LedgerStore`, create directories or write any ledger/source file.
It awaits stdout delivery and never ends borrowed stdout/stderr streams.

| Exit | Meaning |
| --- | --- |
| 0 | Complete output or standalone help was delivered |
| 2 | Argument, encoding, JSON, size, native-ledger or period validation refusal |
| 1 | File access, capture consistency or output-delivery failure |

Refusals have empty stdout unless the output transport itself failed partway.
Diagnostics use escaped text on stderr when that stream is available. A broken
stdout produces failure; retrying is an explicit caller choice.

## API use

```js
import { summarizePeriod } from './tools/lib/period-summary.mjs';

const result = summarizePeriod(savedLedger, {
  from: '2026-01-20',
  to: '2026-02-19',
  currency: 'USD',
});
```

Run source consumers with the same TypeScript-transform flag. The options object
must have exactly the three named own keys, including symbol/non-enumerable key
checks. Values are read into a private synchronous selection. The API returns
detached result objects and does not mutate the original data. `readPeriodSummary`
adds the CLI's ordinary-file capture/provenance envelope; `formatPeriodText`
formats a received envelope without changing its numbers.

## Qualification and source ownership

The pre-code contract and an independent literal numerical key were frozen before
candidate exposure. One original-source observation has completed: actual Node
24.19.0 imported the unchanged core, returned the inclusive 12-occurrence listing
for a fictional mixed-currency period and two complete monthly summaries, and
confirmed the period API was absent. All 14 original predicates passed and the
child was reaped by its owning parent. A separate eight-check read-only collector
bound the saved outputs and source/runtime preservation. No broad earlier suite,
SDK, service, browser or compiler course was rerun.

The original raw receipt inadvertently captured the parent environment. That raw
receipt remains private and is excluded from publication and delivery. The public
projection removes only that field, retains the equality predicate and all other
observations, and binds both hashes without environment values. No product run
was repeated to make that projection.

The sole candidate receiving course completed on Linux with Node **24.19.0**.
All four maintained groups passed, with zero skipped, cancelled or failing groups.
Their five direct CLI controls returned 0, 0, 0, 2 and 2 for JSON, text, help,
duplicate-currency refusal and reversed-range refusal. The tests also exercised
exact byte/row/category/output bounds, unsafe gross-total cancellation, late
invalid records, literal category identity, regular-file admission, strict UTF-8
and borrowed Writable failures. These are focused source-mode results; they do
not qualify the inherited service or replace another owner's tests.

The same finite course then recorded three complete API results against a
separately frozen literal numerical key, followed by one practical JSON command
and one practical text command. All **19 receiving predicates** passed. A separate
read-only collector passed **10 preservation and closure predicates**. The four
direct children were reaped by their owning parent with status 0, no timeout and
no retry; the focused group's five CLI children also returned without signals.
Input, selected runtime, source, config and admitted prior evidence identities
were unchanged, and the owned temporary directory was empty afterward.

For the fictional January 20–February 19 fixture, the complete USD selection has
10 occurrences, income 121100, expense 5503 and net 115597 minor units across six
literal categories. The separate EUR selection has two occurrences, income 200,
expense 900 and net -700. An empty March USD selection returns zero amounts and
no categories. The practical JSON and text retain every USD category, including
`Groceries` versus `Groceries ` and the exact `__proto__` label. The fixture and
results are examples, not a real household's finances.

The tests' small fixtures remain separate from the parent's three complete
practical expected objects. Actual transform warnings remain in the raw streams.
The candidate receiver kept its parent environment in memory and recorded only
an equality result. The original pre-execution guide and original public
projection remain retained as clearly distinguished historical evidence.

This four-new-path offer is based on complete PR8 source
`591ab6f5a2d65bf596aeb707dbb635ee981ec926`. Canonical main is still the separate
README-only branch. ce7 retains source disposition and 61749 retains canonical
and sibling composition. Existing filters, CSV statements, printable records,
monthly reports, two-month comparisons, through-date reports and all recording,
budget, import and service owners retain their scopes. No maintained source,
workflow, package, lockfile, README, existing test or installed service is edited.

The usual repository Node20/npm/typecheck/MCP gates remain separate and unrun.
Any isolated source publication must preserve all inherited leaves and the
standing main/Actions hold. This guide does not authorize main adoption.
