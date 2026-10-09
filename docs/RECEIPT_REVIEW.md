# Review one recorded receipt

This local source tool saves a reviewed or unreviewed state and a literal review note on one existing receipt. It leaves the receipt's amount, currency, date, category, original note, ID, retry key, creation value and other metadata intact. A review flag records the household reader's annotation; it does not verify financial correctness, authenticity or historical approval.

Run from the complete Household Ledger source tree with Node 22.7 or later and its native transform-types support:

```sh
node --experimental-transform-types tools/household-receipt-review.mjs \
  --ledger ./household.json --id receipt-A --state reviewed \
  --note "Matched the saved paper receipt"
```

The tool prints the complete original and proposed receipt as JSON, then prompts on stderr. Type exactly `CONFIRM` followed by Enter to save. `CANCEL`, any other first line, EOF, an unterminated confirmation, or a line longer than eight bytes before LF cancels. LF and CRLF confirmations are accepted. There is no automatic retry. Use `--state unreviewed` with a new review to change that state. Omitting `--note` uses an empty note.

All flags occur once, with a separate literal value. Unknown, duplicate or positional arguments refuse. `--help` alone prints usage without opening a ledger. Exit 0 means help, cancellation or success; exit 2 means an argument, review or original-ledger validation refusal; exit 1 means an I/O failure. An output failure remains nonzero. Check the final result rather than assuming a preview was saved.

## What changes

Only the chosen transaction's own `householdReceiptReview` property changes:

```json
{
  "schema": "household.receipt-review/1",
  "state": "reviewed",
  "note": "Matched the saved paper receipt",
  "recordDigest": "<64 lowercase SHA256 hex characters>"
}
```

The namespace has exactly these four fields. The tool refuses existing unknown schemas, extra fields or malformed namespace values instead of overwriting them. All other parsed JSON values, property names and array order are retained, including unknown transaction, budget and top-level metadata. The unchanged LedgerStore saves through its normal atomic JSON replacement, which can change whitespace and escape spellings. This is parsed-value preservation, not original file-byte preservation for an update.

Receipt IDs are exact, case-sensitive, untrimmed strings of 1–512 Unicode code points. There is no alias, case-folding or first-match fallback. A duplicate exact ID is ambiguous and refuses; a missing receipt refuses. A missing ledger stays missing. Review notes contain 0–2048 Unicode code points and are retained literally. Counting uses JavaScript string iteration and does not normalize Unicode.

The complete original ledger is validated, including late invalid transactions and budgets, before selection. After load, semantic JSON admission accepts finite numbers except negative zero, strings, booleans, null, arrays and ordinary JSON objects. Root depth is 0; every container and primitive is one value node, and property keys are not nodes. The complete loaded and hypothetical changed ledger must each stay within depth 32, 100000 value nodes and 8 MiB of compact UTF8 JSON. These are post-load limits; the original Store's file read and JSON parsing are unchanged and have no new raw-byte/pre-parse bound. Each compact preview or successful API result is at most 1 MiB, inclusive, before any mutation. The CLI's trailing LF is outside that result cap.

## Stale data and repeated confirmation

A preview contains the complete detached `before` and `proposed` receipt, `expectedDigest`, `recordDigest`, and `priorReview` (`absent`, `current` or `stale`). The record digest covers the complete original receipt excluding only this namespace. A saved annotation is stale when its record digest differs from the current original fields; a new explicit preview can refresh that valid annotation.

Digests use SHA256 over UTF8 canonical JSON: recursively sort object keys by JavaScript's default UTF16 code-unit lexical order, preserve array order, use JSON.stringify scalar spellings, and add no whitespace. The expected digest covers the complete before receipt, including an existing review namespace. Digests detect changed data; they are not authentication or approval credentials.

Confirmation reopens and revalidates the complete fresh ledger inside the unchanged Store.update queue. If original receipt fields changed after preview, it refuses. If the requested namespace is already exactly present and the original digest still matches, it returns `already_matching` without writing. Namespace equality compares the four declared values independent of their insertion order. Otherwise the complete before digest must still match before the namespace can be updated. A success returns `updated` and the complete detached receipt.

Different real Store instances loaded from this same source module share the original same-process queue for a resolved path. Identical concurrent proposals produce one update and one matching result. Conflicting proposals from one preview produce one update and one stale refusal. Unrelated queued updates survive. This is not a cross-process writer lock, symlink-alias lock, persistent operation history or ABA/replay approval guarantee. Retrying recordTransaction with its original financial input and retry key still returns the original receipt because those fields remain unchanged.

## Source API and focused tests

Import the real Store and the new helper from the source tree:

```js
import { LedgerStore } from "./src/ledger.ts";
import {
  previewReceiptReview, commitReceiptReview
} from "./tools/lib/receipt-review.mjs";

const store = new LedgerStore("./household.json");
const input = { id: "receipt-A", state: "reviewed", note: "Checked paper copy" };
const preview = await previewReceiptReview(store, input);
// Display the complete preview and obtain explicit caller confirmation.
const result = await commitReceiptReview(store, {
  ...input,
  expectedDigest: preview.expectedDigest,
  recordDigest: preview.recordDigest
});
```

The API requires a direct unmodified instance of this exact LedgerStore, not a subclass or overridden surrogate. Arguments have exactly the declared own keys. Each declared value is read once into a private plain snapshot, which is validated before the asynchronous ledger read or queued update. Later changes to the caller's argument object do not alter the selected ID, state, note or tokens. Declared review refusals use ReviewError; unchanged whole-ledger ValidationError and actual I/O errors retain their original identities. Returned objects are detached. The API caller supplies its own confirmation UI.

The focused source-mode test command uses a new empty owned fixture directory and fictional data:

```sh
RECEIPT_REVIEW_TEST_ROOT=/absolute/owned/new-fixtures \
  node --experimental-transform-types --test test/receipt-review.test.mjs
```

On PowerShell set `$env:RECEIPT_REVIEW_TEST_ROOT` to a new owned directory before running the same Node command. Tests retain their fictional fixtures and child streams there. This source route uses only Node builtins and the exact ledger.ts. It does not qualify the configured TypeScript build, npm suite, MCP SDK, installed service, live ledger, external account or concurrent-process writing.
