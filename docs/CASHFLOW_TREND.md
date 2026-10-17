# Compare cashflow across months

The read-only `cashflow_trend` MCP tool returns an inclusive series of calendar months from one ledger snapshot. It composes the existing `monthly_summary` calculation, including its category totals and budget admission rules.

Use this when asking how recorded income and expenses changed over a quarter, year or other interval. Amounts remain integer minor units of one currency. The tool does not assume that all currencies have two decimal places.

## Call

```json
{"fromMonth":"2025-12","toMonth":"2026-02","currency":"USD"}
```

Both month fields are required and use exactly `YYYY-MM`. The interval must contain 1–120 months, including both endpoints, with years 1970–9999. Months are returned oldest first. Empty months remain in the series with zero transaction totals; applicable planned budgets remain visible.

The currency selector is optional only when the entire interval resolves to at most one currency. A USD-only January and EUR-only February require an explicit selector even though each month is individually unambiguous. Selecting a currency filters every month consistently; nothing is converted. Currency spelling is normalized by the existing monthly-summary implementation.

A completely empty interval without a selector returns `currency: null`. Supplying a selector to an empty interval returns that normalized currency and zero totals. Denominated budgets also participate in currency selection, including months with planned limits and no transactions.

## Response

The response contains:

| Field | Meaning |
| --- | --- |
| `fromMonth`, `toMonth` | Inclusive requested calendar bounds. |
| `monthCount` | Number of rows, including empty months. |
| `currency` | One denomination for every amount, or null for an unselected empty interval. |
| `totals.incomeMinor`, `totals.expenseMinor` | Checked sums of the selected monthly gross amounts. |
| `totals.netMinor` | Period income minus period expenses. |
| `months[].month` | Calendar month as `YYYY-MM`, oldest first. |
| `months[].incomeMinor`, `expenseMinor`, `netMinor` | The existing monthly-summary transaction totals. |
| `months[].cumulativeNetMinor` | Sum of monthly net transactions since `fromMonth`, starting from zero. |
| `months[].byCategory`, `budgets` | The existing monthly-summary results for that month and currency. |

For example, income/expense rows of 1000/400, 0/0 and 100/150 yield monthly net values 600, 0 and -50, cumulative net values 600, 600 and 550, and period totals of income 1100, expenses 550 and net 550.

**Cumulative period net is not an account balance.** The ledger has no opening-balance input or account reconciliation in this tool. A negative value means recorded expenses exceeded recorded income within the selected interval. It does not establish available funds, and omitted transactions remain omitted. No forecast is produced.

Category budgets apply separately to their original months. The tool does not pool limits, roll remaining amounts forward, invent a period budget, or assign a denomination to old records.

## Existing budget and arithmetic rules remain in force

A legacy unassigned budget can be evaluated only under the existing single-transaction-currency rule for its month. An ambiguous, empty or differently selected month with an unassigned budget refuses the whole trend and names the month. Inspect `get_budgets` and explicitly assign the intended currency/limit with the existing `set_budget` action if appropriate. Reading a trend never performs that assignment or a ledger version transition.

Monthly arithmetic is delegated unchanged. The new cross-month sums also refuse results outside JavaScript's safe-integer range, even if income and expenses would cancel to a small net. A failure returns an MCP `isError` response with no partial trend, and performs no write.

The handler calls the existing store's `load()` once and computes all months from that snapshot. A later recording can appear in a later call; this tool is not a cross-process lock. The existing one-server-process-per-ledger-file writer rule still applies.

## Native checks

```bash
npm ci
npm run typecheck
npm test
```

The domain cases cover interval bounds, year transitions, empty and planned-only months, cross-month currency separation, exact monthly parity, unassigned-budget refusals and checked period totals. The actual Streamable HTTP tests record synthetic transactions through the existing service, request trends, compare ordinary monthly responses, verify unchanged ledger bytes, and repeat after a fresh process starts. They also check an absent ledger stays absent on read.

The same three HTTP cases fail against the original five-tool source with `Unknown tool: cashflow_trend`; a valid original monthly-summary control runs before the first new-tool expectation. No live household data is used.
