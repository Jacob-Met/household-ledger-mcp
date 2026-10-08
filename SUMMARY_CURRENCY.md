# Monthly summaries and currency

`monthly_summary` reports transaction totals and applicable category budgets in one currency. It does not convert amounts or add different currencies together. Amounts retain the service's existing integer minor-unit representation.

The optional `currency` input accepts the same three-letter format as transaction recording. Codes are trimmed and normalized to uppercase. The response includes `currency`, which identifies the denomination of `incomeMinor`, `expenseMinor`, `netMinor`, and the transaction totals in `byCategory`.

```json
{"year": 2026, "month": 10, "currency": "USD"}
```

If October contains an expense of 500 USD minor units and another of 800 EUR minor units, selecting `USD` returns an expense total of 500 and selecting `EUR` returns 800. Omitting the selector refuses the report and identifies the available currencies. No exchange rate is implied.

## Selection rules

Transactions and explicitly denominated budgets in the requested calendar month determine its available currencies together. Records in another month do not change that month's selection. Unassigned budgets supply no currency information.

| Known currencies for the month | Selector | Selection result |
|---|---|---|
| One currency | Omitted | Select that currency automatically, including a planned budget with no transactions yet. |
| Multiple currencies | Omitted | Refuse and ask for a currency selection. |
| Any currencies | Supplied | Select the normalized currency for transaction totals and denominated budgets. |
| No matching transactions | Supplied | Return zero transaction totals labelled with the selected currency; an applicable denominated budget has zero spent. |
| No transactions or denominated budgets | Omitted | Use `currency: null` with zero totals, subject to the unassigned-budget rule below. |

A missing selector never defaults to USD or another denomination. Invalid selectors are refused, including when the month is empty. Summaries normalize accepted currency spelling variants while reading and do not rewrite the ledger file. Selection is followed by the unassigned-budget checks below; selecting a currency does not itself assign a legacy budget.

## Denominated budgets

`set_budget` accepts an optional `currency` alongside its required `category`, `month` and `limitMinor`. An explicit currency identifies a separate limit for that category and month. The same category/month may have both USD and EUR limits; updating one preserves the other. A summary includes only the explicitly denominated budgets matching its selection and adds `currency` to those budget result rows. Their `spentMinor` counts expenses in that selected currency and category.

`get_budgets` without a currency filter returns every budget in the month, including unassigned records. Its optional `currency` filter returns only explicitly matching denominations. Omitting currency from `set_budget` retains the unassigned-budget operation and cannot overwrite an already denominated category/month.

## Unassigned legacy budgets

Version-1 budget records contain a category, month, and integer limit without a currency. Version 2 can retain these unassigned records alongside denominated budgets for other categories/months. The service does not infer their denomination from a category, a new budget, or a read request.

An unassigned budget keeps its existing calculation rule: the requested month must contain exactly one transaction currency and the summary selection must match it. This is the existing single-currency monthly convention; it is not a newly stored denomination. Unassigned budget result rows retain their previous shape without a `currency` field.

When the month has any unassigned budget, the **whole summary is refused** if that month contains multiple transaction currencies, contains no transactions, or the selector chooses a different currency from its sole observed transaction currency. This also applies to a zero limit, a category used by only one of a mixed month's currencies, or a partially assigned month. An explicit summary selector cannot resolve information absent from a budget record.

To assign a stored budget, first inspect it with unfiltered `get_budgets`. Call `set_budget` for its category and month with the intended `currency`, intended `limitMinor`, and `replaceUnassigned: true`. Both the explicit currency and replacement flag are required. This updates only the matching unassigned row using the supplied limit without conversion; unrelated unassigned budgets remain unresolved. If multiple unassigned records match that category/month, replacement is refused.

`list_transactions` and `get_budgets` remain available when a summary is refused. Budgets for another month do not block the requested month's summary. A later transaction in a second currency can make a previously valid implicit budget context ambiguous; subsequent summaries reevaluate the stored records.

## Exact integer totals

Every recorded amount already has to be a positive safe integer. A month's income or expense total can nevertheless exceed JavaScript's exact safe-integer range. The summary refuses either unsafe gross total instead of returning a rounded amount, including when income and expense would nearly cancel in the net figure.

The largest permitted gross total is `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991 minor units). The limit applies to the selected currency's totals. Overflow in a different, unselected currency does not alter a valid selected report. The response keeps numeric minor-unit fields without floating-point currency conversion or string amounts.

## Storage compatibility

The reader accepts ledger versions 1 and 2. A missing file and successful legacy-only writes retain version 1. The first successful write of an explicitly denominated budget advances the stored file to version 2, leaving unrelated records and transaction idempotency keys intact. Read calls never perform this transition. Version-1 data containing a denominated budget is refused, as is a conflicting mixture of assigned and unassigned budgets for the same category/month.

Older readers reject version 2, so the upgraded service must continue to read a ledger after that transition. There is no automatic downgrade or bulk assignment of remaining legacy budgets. Failed validation or an unsuccessful atomic write preserves the previously stored bytes; an identical acknowledged retry does not rewrite the file.

The version check occurs when a process reads the file. It does not invalidate a snapshot that an older process already read. Finish outstanding writes and stop older processes before upgrading, and use one server process for each ledger file. Mutation serialization coordinates requests within that process; it is not a lock shared by separately running servers.

## Compatibility and verification

The TypeScript summary call is `monthlySummary(data, year, month, currency?)`. Budget calls are `setBudget(data, category, month, limitMinor, currency?, replaceUnassigned?)` and `getBudgets(data, month, currency?)`. Existing callers can omit the summary selector when there is one available currency and the unassigned-budget rule is satisfied. Transaction recording, keyed retry/conflict handling, mutation serialization, atomic persistence, and transport mechanisms are retained.

The existing currency receiving tests use the installed MCP SDK through linked in-memory transports and real local Streamable HTTP child processes. They cover normalized selection, process restart, malformed input, changing monthly currency context, unassigned budgets, exact integer boundaries, overflow, and unchanged persisted bytes after reporting. The combined source includes the separately attributed reserved-category map repair. Denominated-budget tests additionally cover explicit assignment, per-currency limits, storage compatibility, and unspent planned months. Independent HTTP receiving challenges partial assignment, concurrent limits, restarts and recovery from a declared atomic-rename failure.
