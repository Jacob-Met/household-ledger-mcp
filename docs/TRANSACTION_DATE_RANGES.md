# Transaction date ranges

`list_transactions` uses inclusive calendar dates. When supplying both `from`
and `to`, put the earlier date in `from`. Equal endpoints select that one day.
Omitting either endpoint keeps the existing open-ended selection.

For example, `{ "from": "2026-10-01", "to": "2026-10-31" }` selects October.
Reversing those dates returns the normal MCP error result with
`from must be on or before to`; it no longer reports a successful empty list.
Correct the submitted range and request it again. The service does not swap the
dates, infer a different period or modify the ledger.

A valid interval with no matching transactions still returns
`{ "total": 0, "transactions": [] }`. Type/category filters and pagination
continue to apply to valid intervals; they do not make a reversed interval valid.
Both endpoints still pass the original real-calendar-date validator first.

The correction is one admission check inside the existing `listTransactions`
function. The unchanged MCP handler still loads and validates the complete saved
ledger before calling that function. This is not a new pre-read validation or
partial-ledger admission path. No Store, persistence, transaction, budget,
currency, ordering, returned-record or write behavior changes.

## Verification and source boundary

Run `npm run typecheck` and `npm test` with the existing locked dependencies.
The two `test/transaction-date-range*.test.ts` files exercise the actual domain
and the official SDK over the real loopback HTTP handler, with fictional private
ledgers. HTTP receiving invokes the unchanged exported `main` explicitly; it
does not qualify or repair platform-specific direct-entrypoint detection.
Cases cover reversed and equal dates, inclusive/open/empty selections, existing
endpoint refusals, filters/pagination, exact rows, saved bytes/inode/mtime and a
missing ledger remaining absent. Original failures and exact execution versions
are recorded in the accompanying receiving evidence.

The parent is complete-source PR8 `591ab6f5a2d65bf596aeb707dbb635ee981ec926`.
This isolated descendant does not adopt that proposal into README-only main,
compose the separately owned currency/text-filter increment, waive its owners'
gates, install a service or read a live household ledger. Existing source-parent
and canonical integration ownership stays with ce7 and 61749.
