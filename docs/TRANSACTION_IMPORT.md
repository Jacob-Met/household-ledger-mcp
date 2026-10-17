# Import household transactions from CSV

Use `preview_transaction_import` to review a prepared CSV, then `commit_transaction_import` to record its complete batch. This helps move existing household records into the ledger without entering each transaction separately. Both tools use the same native transaction rules as `record_transaction`.

## Prepare the CSV

The first record must name every required column. Their order may vary.

| Column | Required value |
| --- | --- |
| `idempotencyKey` | A stable, distinct identity for this source record, at most 128 Unicode code points with no surrounding whitespace. Keep it unchanged when retrying or exporting the same record again. |
| `type` | `income` or `expense`. |
| `amountMinor` | Positive integer minor units written as decimal digits, at most `9007199254740991`. For a currency with cents, `1250` means 12.50. Negative signs, decimal points, separators and exponent notation are refused. |
| `currency` | An explicit three-letter currency code. Surrounding whitespace is removed and letters are uppercased. No exchange conversion occurs. |
| `date` | An explicit real calendar date in `YYYY-MM-DD` form, using the native recorder's date rules. The tool does not choose today's date. |
| `category` | An explicit nonempty category. Surrounding whitespace is removed. |
| `note` | Optional column. Its cell is kept exactly, including leading/trailing spaces, quotes and line breaks. |

For example:

```csv
idempotencyKey,type,amountMinor,currency,date,category,note
bank:checking:oct-001,income,200000,USD,2026-10-01,salary,October pay
bank:checking:oct-002,expense,1250,USD,2026-10-02,groceries,"Bread, fruit and milk"
bank:travel:oct-003,expense,900,EUR,2026-10-03,transport,
```

Use a source record's existing stable identity, preferably qualified by its source or account when that identity is only unique there. Two legitimate transactions with the same amount and date still need distinct keys. The tool does not invent content-based keys or infer a bank's column mapping. Preparing a new export must retain the same key for the same logical recording.

The native schema supports `idempotencyKey` and `note`. It does not accept caller-assigned transaction `id`, `createdAt`, `memo`, `source` or account columns. Unknown columns are refused rather than discarded. Map supported source identity into `idempotencyKey` and any desired text into `note` before previewing. Native IDs and creation timestamps are assigned to new records during commit; preview does not invent final IDs or timestamps. Existing matches keep their original IDs and timestamps.

Omitting the `note` header leaves the optional native note absent. Including the header with an empty cell supplies the explicit empty string. Those inputs are distinct under native retry rules, so keep the choice consistent across exports.

The parser supports commas inside quoted fields, doubled quotes (`""`) inside quoted fields, literal quoted line breaks, CRLF/LF/CR record endings and an optional leading UTF-8 BOM. It refuses malformed quotes, extra or missing fields, repeated headers, repeated keys within the same CSV and blank transaction records. A final record ending is allowed. Each preview row reports the physical line on which its CSV record starts.

Each request may contain at most **256 KiB of UTF-8 CSV, 500 transaction rows and 8192 UTF-8 bytes per decoded field**. Ill-formed Unicode is refused. These limits also apply to commit. Larger exports need separately reviewed batches, each with its own complete header and stable keys; atomicity applies to one batch.

## Preview and review

Pass the complete CSV text as the `csv` string argument. The service does not read a supplied file path or fetch a URL.

```json
{"name":"preview_transaction_import","arguments":{"csv":"idempotencyKey,type,amountMinor,currency,date,category\nbank:checking:oct-002,expense,1250,usd,2026-10-02, groceries "}}
```

The response has these fields:

| Field | Meaning |
| --- | --- |
| `schema` | `household-transaction-import/1`. |
| `sourceSha256` | SHA-256 of the exact UTF-8 CSV text, including its BOM, quoting and line endings. |
| `reviewToken` | Content-binding token for this CSV, or `null` when the preview cannot commit. |
| `canCommit` | True for a nonempty, valid batch with no current key conflicts. An all-matching retry is valid. |
| `counts` | `total`, `add`, `alreadyRecorded` and `conflict` row counts. |
| `rows` | Each row's physical `line`, exact normalized native `input` and `action`. Matching or conflicting rows also include the original `existingTransaction`; conflicts include a `reason`. |
| `totals.allRows` | Gross income, gross expenses and net for every incoming row, grouped by currency. These describe the proposed CSV, including any conflicts. |
| `totals.additions` | The same totals for rows currently marked `add`. |

Every totals entry contains `currency`, `incomeMinor`, `expenseMinor` and `netMinor`. Gross income and gross expense are separately checked against the safe integer limit; values are never rounded or combined across currencies. These are batch totals, not an account balance or a currency conversion. Empty totals contain an empty array.

Review every normalized `input`, the count and totals for each currency, and any original matching/conflicting records. `add` means no current record uses that key. `already_recorded` means the native input exactly matches the original record. `conflict` means that key already belongs to different input. The tool never overwrites a conflicting transaction. Correct the source data or investigate the key, then obtain a new preview.

Preview performs no ledger write, creates no missing ledger file, changes no budgets and does not retain the raw CSV in the service's data file. Validation failures return the existing MCP `isError` response. A header-only CSV is a valid empty preview with `canCommit: false` and no token.

## Commit the reviewed content

After review, call `commit_transaction_import` with the **identical** `csv` string and the returned `reviewToken`:

```json
{"name":"commit_transaction_import","arguments":{"csv":"idempotencyKey,type,amountMinor,currency,date,category\nbank:checking:oct-002,expense,1250,usd,2026-10-02, groceries ","reviewToken":"use the token returned for this exact CSV"}}
```

Changing even a line ending, BOM, header order or equivalent numeric spelling requires a fresh preview. The token binds content; it is not authentication, proof that a person reviewed the file, an expiring session or a lock on the ledger. Clients should present the preview for review before invoking commit.

Commit validates all rows, enters the existing serialized writer once, reloads current data and rechecks every key. It stages additions separately and publishes them together through the native atomic save. A conflict in any row refuses every addition in that batch. A failed persistence operation preserves the previous file and the writer remains available for retry. The tool does not modify existing transactions, budgets, ledger versions or the writer implementation.

Another request can finish between preview and commit. An identical recording that now exists becomes a benign match: commit returns its original record, and the actual number added may be smaller than preview showed. A different recording with that key refuses the whole batch. Unrelated later transactions and budget changes are preserved. The normalized transaction values themselves do not change at commit.

The commit response contains `schema`, `sourceSha256`, `added`, `alreadyRecorded`, per-currency `totals` for the actual additions, and `transactions` in CSV order. The transaction list includes both newly recorded transactions and original matching transactions. It is the authoritative record of what this successful attempt added or reused.

Retrying the identical content after an uncertain response returns original records without creating duplicates. An all-matching retry does not rewrite the ledger file. A newly formatted export also reuses original records when its stable keys and normalized inputs match, after a fresh preview. Reusing a key for a different input is always refused.

Continue using **one server process per ledger file**; connect multiple clients to that shared process. Finish or stop older writers before changing service versions. The existing writer serializes mutations within one process and atomically replaces the data file; this feature adds no cross-process lock. Run the normal local MCP service with an explicitly chosen private data path, as described in the main README.
