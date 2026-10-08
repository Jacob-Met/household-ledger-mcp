# Reviewed budget reallocation

Use `preview_budget_reallocation` to review a change to one month's planned category allowance, then submit that complete review to `commit_budget_reallocation`. Both category limits change in one existing Store update, so the operation preserves their combined allowance. This does not move money, edit transactions, change recorded spending, create budgets or convert currencies.

## Example

With an October USD food allowance of 1000 minor units and travel allowance of 500, call:

```json
{
  "name": "preview_budget_reallocation",
  "arguments": {
    "month": "2026-10",
    "currency": "USD",
    "fromCategory": "food",
    "toCategory": "travel",
    "amountMinor": 250
  }
}
```

The result shows food changing from 1000 to 750, travel from 500 to 750, and a combined allowance of 1500. These are integer minor units; interpret them using the selected currency's convention. Review both category names, month, currency and limits. To apply the change, call `commit_budget_reallocation` with an object whose sole field is `review`, containing the entire unchanged preview result, including its `reviewToken`.

The commit reports `applied` after persistence succeeds. The existing monthly summary and cashflow tools then show the new category limits and remaining allowances against the same recorded spending. A smaller limit can be below spending already recorded; this is allowed and the existing summary reports that category over budget.

## Exact scope and fresh state

Both categories must already have explicitly denominated budgets in the selected month and currency. Category names match recorded strings exactly, including meaningful spaces and Unicode. Currency input is trimmed and uppercased as a three-letter code; the stored category and currency strings are retained. Legacy unassigned budgets, absent categories, different categories' months/currencies and ambiguous rows are not guessed or created.

The amount must be a positive safe integer. The source must contain sufficient allowance. The combined pair total and resulting limits must fit JavaScript's safe integer range. Moving the full source allowance to the destination is supported; the source limit becomes zero.

Commit loads fresh data through the existing Store's serialized update. It changes only the two selected `limitMinor` values. New transactions, unrelated budgets, row order, metadata and recording identities remain intact. If either reviewed limit changed, disappeared or became invalid, the whole operation refuses; obtain a new preview and review the new numbers.

If both current limits already equal the proposed final values, the result is `already_matching` and no file is rewritten. This safely resolves a usual lost-response retry while the pair remains at those values. It is a statement about current values, not proof that this request executed before: another action could have set the same limits.

There is no durable request-history record. If later actions restore the exact original pair, submitting an old review can apply the move again. Always obtain a new review for a new user action. The tool's MCP idempotence hint is deliberately false for this reason. The token is a deterministic content digest, not authentication, evidence of human approval, a secret or a lock.

## Persistence and operational boundary

This flow inherits the existing Store's queue and atomic replacement behavior. Changes are serialized among Store instances for the same resolved path in one process. It adds no cross-process lock, account integration, network service deployment or stronger power-loss guarantee. A persistence error is returned; the caller can inspect current budgets and retry the same reviewed change if they remain appropriate.

The contribution is based on qualified PR #8 source `591ab6f5a2d65bf596aeb707dbb635ee981ec926`. Source-parent disposition remains with `estate-ce7eb129730f`; canonical receiving remains with `estate-61749b0088e2`. It adds its own module, MCP hooks and tests without changing the ledger schema, core Store or other owners' month-copy/filter/import/report implementations. Canonical publication should compose its additive hooks with those contributions instead of importing native snapshot ancestry.

## Verification

The maintained `npm test` command compiles TypeScript and discovers the new native and actual HTTP MCP tests with the existing test wildcard. The tests use synthetic ledgers and private local servers. They cover simultaneous identical and competing reviews; stale and malformed input; real filesystem persistence refusal followed by a fresh-state retry; exact category/currency preservation; summary/recording continuity; and matching retry through a newly launched server. Existing tests retain all assertions, with only the expected tool-name lists extended.
