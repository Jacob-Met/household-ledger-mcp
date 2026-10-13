# Review transactions oldest first

`list_transactions` accepts an optional `order` of `"newest"` or `"oldest"`. Omit it to retain the existing newest-first behavior. The operation first applies its existing type, category and inclusive date filters, orders every matching row by calendar date, then applies `offset` and `limit`.

For example, an MCP call to review the first 20 expenses in October is:

```json
{
  "name": "list_transactions",
  "arguments": {
    "type": "expense",
    "from": "2026-10-01",
    "to": "2026-10-31",
    "order": "oldest",
    "offset": 0,
    "limit": 20
  }
}
```

Use the same filters and order with `offset: 20` for the next page. `total` counts all matching rows, including occurrences beyond the selected page. A zero limit or an offset beyond the result still reports that total with an empty `transactions` array.

## Equal dates and saved data

Both directions retain the original saved-array order of equal-date rows. This is date ordering, not ordering by `createdAt`, ID or note. Oldest-first does not reverse ties. Duplicate IDs, identical repeated rows, currencies and literal record fields are preserved; ordering does not calculate or convert any amounts. The domain operation sorts a filtered array and retains the original row references. The MCP response serializes those rows without changing the ledger file.

This is offset pagination over the ledger loaded for each call, not a persistent snapshot or cursor. Concurrent additions or edits can change which rows appear on later pages; repeat against an unchanged saved ledger when a stable complete review is needed.

Only the exact lowercase strings `"newest"` and `"oldest"` are accepted when supplied. Other strings, numbers, booleans and JSON null return the existing controlled validation error form, with `order must be newest|oldest`. The direct TypeScript API also treats omitted or `undefined` order as newest. Existing date and pagination admission remains: real calendar dates, inclusive endpoints, `from <= to`, integer limits from 0 through 1000, and nonnegative integer offsets. The MCP handler retains its existing load-before-domain-validation behavior.

## Source and qualification

This source offer builds on the date-range correction at `8729c9fb7b3b8e941662eefe9f6bfdc1fa7e8311`, itself a child of the complete PR #8 package. Canonical `main` was README-only when this increment was prepared. This offer does not install a service, adopt into main, or combine other pending filter or printable-report branches.

The focused regression is `test/transaction-order.test.ts`. In a normally provisioned checkout, the existing `npm test` command builds and runs tests, and `npm run typecheck` performs the strict TypeScript check. This receiving environment has Node 24.19.0 and the exact delivered SDK runtime but no TypeScript compiler. Its actual source receiving uses Node's experimental `module.stripTypeScriptTypes` transform mode, separately preserving emitted files and source pins. That execution is not a successful `tsc` build or strict typecheck claim. The original compiled service and a transformation of the unchanged parent provide separate compatibility controls.

The receiving packet contains an original actual MCP stdin witness, a matching candidate journey using fictional transactions, and the focused domain regression. The original service ignored `order: "oldest"` and returned newest-first rows; the changed service advertises the optional enum and returns the chronological page. Source, ledger bytes, SDK runtime, and existing date-range behavior are checked separately. No real household account or installed deployment is exercised.
