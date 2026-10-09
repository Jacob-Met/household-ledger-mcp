# Remove one obsolete budget allowance

An allowance of zero is still a budget. This workflow removes one explicitly denominated category/month allowance after you review its complete stored value. It does not remove expenses or income, and it leaves other currencies, categories and months in place.

The selection is the **exact stored category string**, a YYYY-MM month and an explicit three-letter currency. Category whitespace and case are significant. The currency selector is trimmed and uppercased for matching; the review still shows the original stored currency spelling. Legacy budgets without a denomination are not admitted. Assigning or otherwise changing those budgets is a separate existing workflow.

## Use the terminal client

From this source checkout, use the unchanged dependency lock and build:

~~~sh
npm ci
npm run build
node dist/src/household-remove-budget.js --url http://127.0.0.1:3000/mcp --category "Old plan" --month 2026-10 --currency USD
~~~

The service must already point at the ledger you intend to use. Use one server process per ledger file, as required by the existing Store. This client requires an explicit loopback HTTP /mcp endpoint, rejects embedded credentials/query/fragment and refuses redirects. It adds no authentication or remote exposure.

The terminal prints the complete budget as JSON, including extra fields, plus the normalized selector and its 64-character review token. Quotes, newlines and control characters are escaped; directional formatting controls are shown as Unicode escapes. Amounts remain integer minor units in the stated denomination.

Only the exact line shown by the prompt, **REMOVE followed by a space and that full token**, sends the removal. Anything else or end-of-input cancels without a removal request. There is no command-line auto-confirm option. On success, the terminal prints the complete removed budget and the server's remaining total budget count.

Exit 0 means the server returned a structurally checked confirmation for the exact reviewed value. Exit 2 means cancelled. Exit 1 means an input, connection, preview or unconfirmed-removal error. A lost response may occur after the file was saved: the client sends the commit once and never retries it. Inspect fresh ledger state before deciding on any new action. A later attempt finding the budget absent refuses; it does not invent a receipt for an earlier attempt.

### Windows service receiving

The existing parent direct-entry guard in src/index.ts does not start the server under the tested Windows path spelling. This contribution preserves that separately owned entrypoint. Native qualification called its real exported main explicitly. For an intentionally chosen private ledger path and unused port, the equivalent PowerShell receiving command is:

~~~powershell
$env:HOUSEHOLD_LEDGER_DATA_PATH = 'D:\your-private-folder\ledger.json'
$env:HOUSEHOLD_LEDGER_HOST = '127.0.0.1'
$env:HOUSEHOLD_LEDGER_PORT = '3100'
node --input-type=module -e "import { main } from './dist/src/index.js'; await main();"
~~~

Run the terminal client in another terminal with the matching endpoint. Do not start a second server for a ledger already in use. No live or installed estate ledger was opened or changed during qualification.

## MCP interface

- **preview_budget_removal** takes category, month and currency. It is read-only and returns schema household-budget-removal/1, selector, the complete before budget, and reviewToken.
- **commit_budget_removal** takes those same three inputs and the reviewed reviewToken. It is explicitly destructive. Inside the existing Store update queue it reloads the current file, finds the one matching budget, recomputes the complete target digest and removes that current array occurrence only if it still matches.

A change to any selected budget value, including an unknown nested field or the original currency spelling, invalidates the review. Reordering JSON object keys does not. A changed array order does. An unrelated current transaction, budget or top-level field does not invalidate an unchanged selected target and is retained by the write. Moving the selected budget's position among unrelated entries does not change its identity.

The token is a content binding, **not authorization, a secret, a ledger identity, a lock or a history record**. Identical target contents in another ledger produce the same token. An identical remove-and-recreate sequence cannot be detected. The unchanged Store serializes cooperating updates inside one process and uses its existing atomic file replacement; this feature adds no cross-process transaction or crash guarantee.

The target review is limited to 64 KiB of canonical UTF-8 JSON and nesting depth 32. Before both preview and commit, all current ledger numbers must be finite. This additional refusal matters because the existing reader can parse a number such as 1e400 in an unknown field as Infinity, which JSON.stringify would otherwise change to null. Such a ledger is left byte-for-byte untouched. No repair is attempted.

Successful writes retain parsed JSON values and unknown fields through the existing Store, including every transaction and unrelated budget, and keep the current schema version. They use its existing pretty-printed JSON serialization, so original whitespace and key formatting are not a byte-preservation promise. Refused operations do not write.

## Verification and receiving limits

Qualification used Node 24.19.0 on Windows, TypeScript 5.9.3 and the unchanged lock's MCP SDK 1.32.1. The original parent compiled and passed 89 of 101 existing controls; its 12 HTTP controls exited before listening because of the unchanged Windows entrypoint guard. Those failures are retained separately from this feature.

The feature's first maintained phase passed 16 domain/consumer controls and four existing MCP controls. Five actual HTTP/terminal controls passed, covering cancellation/EOF, exact confirmation, a selected value changed after review, preservation of an unrelated intervening write, and a response deliberately lost after persistence with exactly one mutation request.

A subsequent real counterexample exposed the unknown-field Infinity-to-null issue. The original source and failure are retained. The corrected finite-number admission passed its new three-location refusal control plus the two affected ordinary domain/HTTP controls. The earlier suites were not represented as rerun on the correction.

An independent receiver then passed seven groups and found a queued-call input-lifetime failure: a native caller could replace its argument token while waiting behind another Store update. The commit now captures the validated token before entering that queue. The original failure and source remain intact; one new maintained regression passed on that correction. Independent receiving has its own phase-pinned receipt. No earlier whole suite is claimed as rerun.

Run the maintained feature tests after building:

~~~sh
node --test dist/test/budget-removal.test.js dist/test/budget-removal-http.test.js
~~~

The HTTP receiver explicitly imports the real server main in a child and uses temporary synthetic ledger files. It does not alter the existing startup guard or open a user's normal ledger. Source integration, installed-service acceptance and a human terminal session are separate from these automated native results. The estate Actions hold remains in force.
