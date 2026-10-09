# Print selected saved transactions

Create a standalone, printable HTML review of every recorded entry matching an explicit date range. This is a local saved-file consumer: no server, credential, provider call, ledger update or automatic save is involved.

Build with the repository's existing TypeScript dependencies, then run:

```sh
npm run build
node dist/src/household-print.js --ledger "/path/to/ledger.json" --from 2026-10-01 --to 2026-10-31 --out "/path/to/new-review.html"
```

The output's parent directory must already exist. Choose a **new** output filename. Existing files, directories, hard links and even dangling symlinks are refused; there is no force option. The input must be an explicit regular file, not a symlink. No default ledger path is consulted.

Open the resulting HTML file directly in a browser. Review the selection and source information, then use the browser's **Print** command to print or save a PDF. Every selected entry, note and complete parsed record is visible in the document and print output. Nothing needs to expand first. Keep exported household information private.

## Select exactly what was recorded

The two dates are required and inclusive. The unchanged native ledger validator and `listTransactions` determine admission and selection. Records appear newest date first; tied dates retain saved-array order. Optional selectors are:

```sh
node dist/src/household-print.js --ledger ledger.json --from 2026-10-01 --to 2026-10-31 --type expense --category " food " --out new-food-review.html
```

Type is exactly `income` or `expense`. Category is a nonempty **exact** string: whitespace and case matter, and are never trimmed. A spaces-only selector is valid and ordinarily matches no entries. An empty selection still produces a complete document stating that no entries matched.

The command collects all native pages, beyond the default 50 and single-page limit of 1,000. It refuses a selection over 5,000 entries as a whole; it never publishes a successful prefix. Each displayed entry has its original **1-based saved-array position**, so repeated IDs and otherwise identical saved records remain separate.

## Read the values literally

Amounts are the original positive safe integers in **minor units**, accompanied by each original currency string. There are no totals, running balances, budget comparisons, exchange rates or conversions. Mixed recorded currencies can be reviewed together without combining their amounts.

Missing and empty notes are distinguished. Missing created-at metadata is never invented. The current native validator does not qualify `createdAt` as a timestamp, so any retained value is presented as literal metadata. The complete parsed record includes unknown fields and preserves numeric negative zero. It represents parsed JSON values, not original spacing, key spelling escapes or raw numeric spelling.

The document identifies the input filename, byte count, SHA-256 and exact selectors. A checksum identifies local bytes; it does not prove authorship, a bank transaction, receipt or payment.

## Bounded and exclusive publication

The consumer admits at most 4 MiB of strict UTF-8 source, JSON depth 32 and 100,000 value nodes, 5,000 matched entries, and 8 MiB of complete output HTML. Invalid native data anywhere in the ledger, nonfinite parsed numbers, malformed UTF-8 and excess limits refuse the whole operation. Selected strings containing unsupported control characters or isolated UTF-16 surrogates are refused instead of silently replaced. Tab, LF, CR and valid Unicode are preserved.

The command reads a bounded stable source snapshot, prepares the entire document in a private temporary file, rechecks the original source bytes and file identity, and atomically creates the new output name without overwriting a competing destination. Its successful stdout JSON receipt binds the source, selection count/positions and output hashes. Errors exit nonzero without a success receipt. This is a source recheck, not a lock against later edits by another process.

No existing domain, persistence, server, CSV, monthly summary, filter, recording, budget or import code is changed. This additive consumer was received against draft PR8 source `591ab6f5a2d65bf596aeb707dbb635ee981ec926`; canonical main was still README-only. Its source-parent owners retain integration control.

## Developer receiving

After compiling, run the dedicated native tests:

```sh
node --test dist/test/transaction-print.test.js dist/test/transaction-print-cli.test.js
```

The standalone browser receiver uses only Node 22+ built-ins and a supplied Chromium executable:

```sh
node tools/check-transaction-print.mjs /absolute/new-receiving-directory /absolute/path/to/chromium
```

It authors its own ledger, invokes the actual compiled CLI, checks direct-file desktop and 390px rendering, exact row/record/selector provenance, complete long notes in actual PDF, and a fresh relocated copy with the source ledger absent. It uses an isolated profile and offline browser conditions, and removes only its own closed profile. `pdftotext` is needed for the PDF text check. This does not access a real household ledger or call a provider.
