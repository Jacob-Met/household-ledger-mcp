# Record one household entry

This terminal client records one income or expense through an already running
Household Ledger MCP service. It does not transfer money. Existing recording,
currency, date, category and idempotency rules come from the unchanged service.

Build using the normal project setup, then run in an interactive terminal:

```sh
npm run build
node dist/src/household-record.js new --endpoint http://127.0.0.1:3000/mcp --request /private/new-purchase.json
```

The request's parent directory must already exist. Choose a **new path** in a
private directory; an existing file or link is refused without replacement.
The client asks for income or expense, a positive integer amount in minor units,
a three-letter currency, a real YYYY-MM-DD date, category and optional single-line
note. For example, 1250 means 1250 minor units, never an inferred decimal amount.
There is no default date or currency. Blank note omits that field. Input is
validated as one complete record; refusal requires starting again.

The actual domain validator normalizes currency and category for the preview.
The client generates a stable key for this one recording and writes the complete
request with mode 0600, flushes it and closes the file **before** any MCP
connection. This is a local recovery request, not proof that the entry exists.
It contains private transaction data, including note and key, in plain UTF-8 JSON.

Read every displayed field and endpoint, then type exactly **RECORD** to make one
recording call. Any other response, EOF or Ctrl-C cancels. The complete recovery
request stays on disk even when canceled. Terminal input/output must both be
interactive; piping a confirmation is refused. JSON notation escapes controls
and invisible directional/format characters so they cannot alter the review
layout. The underlying saved text is unchanged.

## A lost response

If the terminal reports **UNCONFIRMED**, the service may already have saved the
record. A malformed or mismatched success response is also unconfirmed.
The client never automatically retries and never creates a replacement key.

Reopen the existing request:

```sh
node dist/src/household-record.js resume --request /private/new-purchase.json
```

Resume admits a bounded regular UTF-8 request, retains its exact normalized
values and endpoint, shows them again, and requires another explicit RECORD.
It does not allow an endpoint override or generate a new key. An exact retry
against the **same underlying ledger** returns the original transaction without
rewriting it. The confirmation output includes the actual returned ID, timestamp
and fields; it may be a replayed original, not a new creation. The request remains
available after success, and the client neither deletes it nor writes a receipt.

The endpoint is limited to explicit HTTP 127.0.0.1 or [::1] /mcp URLs with no
credentials, query or fragment. Redirects are refused. A URL is **not a ledger
identity**: if a different server or data file later occupies that address, the
existing MCP protocol cannot establish that it is the same ledger. Check the
service's configured data path before resuming. Keep one server process per
ledger, as required by the service. This client adds no authentication, remote
connection, server start, live-account connection or cross-process writer lock.

An existing key with changed fields is refused by the service. Do not edit a
recovery request to change an uncertain recording. Resolve its original result
first; a different actual purchase needs a deliberately new request.
The 64 KiB request limit is a client bound, not a new ledger-format limit.
Notes entered interactively are single-line; an admitted recovery file retains
all validated literal note content without terminal interpretation.

## Outcomes and receiving

Exit 0 means a structurally valid, field-matching service response confirmed a
recording. Exit 2 means cancellation before the recording call. Exit 3 means
connection/pre-send cancellation or an unconfirmed recording attempt; the printed
state distinguishes those. Exit 1 means arguments, input, recovery-file or other
local admission refused. A process/terminal failure can occur at any point:
use the retained request and inspect the same ledger rather than infer absence
from an exit status.

There is no durable cross-file transaction between this recovery request and the
ledger. The service remains the sole writer; the client never opens the ledger.
The local file flush is not a power-loss guarantee, and no concurrent external
editing of the recovery path is supported.

Focused native checks after build:

```sh
node --test dist/test/record-client.test.js dist/test/record-client-http.test.js
```

The HTTP tests use actual private synthetic ledgers and server processes,
including a forwarding proxy that loses the response only after the upstream
recording completed. Explicit retry returns the same record. Filesystem,
normalization, conflicting replay and canceled-call cases are separate from
actual terminal input receiving preserved in the contribution packet.
