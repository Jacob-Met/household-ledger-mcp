# Recurring rules to an explicit monthly expense plan

This command expands reusable expense rules into the existing `household-expense-plan/1` file for one month. Open that plan with the existing expense-plan preview to see the modeled effect on a captured ledger and its budgets. Generating or previewing a plan does not record an expense.

This is an additive consumer of the qualified expense-plan source described in [EXPENSE_PLAN.md](EXPENSE_PLAN.md). It preserves the ledger, Store, server/router, preview and file-delivery helpers. The canonical repository's source-adoption status is separate from this isolated contribution.

## Generate and review

In a built source checkout with an existing Node 20+ runtime:

```sh
node dist/src/household-recurring-plan.js --rules recurring.json --month 2026-10 --out october-plan.json
node dist/src/household-plan.js --ledger ledger-snapshot.json --plan october-plan.json --month 2026-10 --currency USD --out october-preview.html
```

The second command's currency must equal the first command's normalized receipt currency. The existing plan format has no currency field: the plan by itself cannot establish the denomination. No exchange conversion is performed.

All three producer options are required exactly once. The rules file must exist; the output parent directory must exist and the output filename must be new. `--help` alone describes the command.

A complete rule document:

```json
{
  "schema": "household-recurring-expenses/1",
  "currency": "USD",
  "rules": [
    {
      "id": "monthly-home",
      "start": "2026-01-31",
      "category": "Home",
      "amountMinor": 140000,
      "repeat": { "unit": "month", "every": 1, "missingDay": "last" }
    },
    {
      "id": "weekly-food",
      "start": "2026-10-05",
      "end": "2026-10-26",
      "category": "Food",
      "amountMinor": 4200,
      "note": "Declared weekly allowance",
      "repeat": { "unit": "week", "every": 1 }
    }
  ]
}
```

For October this produces four weekly dates (5, 12, 19 and 26), followed by October 31 for the monthly rule. The five additions total 156800 integer USD minor units. These are declared plan amounts, not a spending prediction.

## Calendar and identity rules

| Choice | Meaning |
| --- | --- |
| Weekly `every: n` | The original start date and weekday anchor every `7*n` calendar days. Weeks are not ISO-week labels; 52 weeks is 364 days. |
| Monthly `every: n` | Months are counted from the original start month. The original day is reused, so a 31st clamped in February returns to the 31st in March. |
| Monthly `missingDay: "last"` | An absent original day becomes that eligible month's last actual day, if inside the active interval. |
| Monthly `missingDay: "skip"` | No expense is generated for an absent day. A missing-day projection is reported only if the month's last actual day is inside the active interval. It is not an expense date. |
| Optional `end` | Inclusive. A candidate after this date is excluded. |
| Selected month | Only dates in this explicit month are emitted; partial weeks are included. |

For a January 31 rule in a nonleap year, an end of February 27 yields neither a February occurrence nor a missing-day projection. An end of February 28 permits the missing-day projection under `skip`, or the February 28 expense under `last`. This keeps reporting eligibility tied to the same slot while retaining the distinction between an absent day and an actual expense.

Dates use the Gregorian calendar, independent of local timezone or daylight-saving changes. Supported dates are 1970-01-01 through 9999-12-31; selected months are 1970-01 through 9999-12. Weekly intervals are integers 1..52 and monthly intervals1..120. There are no holiday, business-day, bi-monthly-date, settlement or payment-service rules.

Each rule needs an exact unique ID of 1..128 Unicode code points, with no surrounding whitespace, control characters or malformed Unicode. Case and Unicode normalization are preserved. Different IDs with identical terms remain separate; there is no inferred deduplication. Expenses sort by date and then original rule order.

## Validation and exact amounts

The root and every rule/repeat object accept only the documented fields. Up to 100 rules and 500 generated occurrences are allowed. An empty rule list or a month without matches produces a valid empty plan.

Amounts must be positive safe-integer minor-unit numbers. Currency and category use the existing native validation and normalization; notes remain literal strings, including empty text and unusual Unicode/control content supported by the existing preview. An absent note stays absent. Every rule is validated even when its dates are outside the selected month. Expansion then uses the native preview's checked aggregate arithmetic, so a total outside the safe-integer range refuses rather than rounding.

JavaScript's parsed number semantics apply; this is not a validator for the original spelling of decimal tokens. The source CLI accepts at most 1 MiB of complete UTF-8 JSON. The API applies the same bound to `JSON.stringify(input)`. The complete output, formatted as two-space JSON plus one final newline, must also fit 1 MiB. Repeated long notes can make a valid-size source exceed the output bound; the command refuses the whole output.

## API and occurrence review

`generateRecurringExpensePlan(input, month)` returns a detached, deeply frozen object:

```text
{ month, currency, plan, occurrences, skipped }
```

`plan` contains exactly the existing schema and expense rows. It has no extra currency or rule fields. Each occurrence projection is `{position, ruleId, rulePosition, date}`: both positions are 1-based, and the occurrence points to that output plan row. Positions are local to this generated month, not permanent or lifetime occurrence IDs. Each skipped projection is `{ruleId, rulePosition, month, requestedDay, reason:"missing-day"}`; no expense date is invented.

The function does not mutate or freeze the input. Native validation uses temporary detached ledger state; generated transaction IDs and timestamps from that validation never appear in the result. Repeated calls with the same inputs produce the same plan and projections.

## Complete file and receipt delivery

The CLI captures one explicit regular rules file and prepares all plan and receipt bytes before publication. It uses the existing source recheck and exclusive hard-link publication helper, so an existing output is never replaced. Sources are checked again at delivery; this is not a writer lock or a guarantee that a source cannot change after that check.

Success writes one compact JSON line to stdout with schema `household-recurring-expense-plan-delivery/1`, selected month, normalized currency, source/output identities and the occurrence/skipped projections. Each identity contains the resolved absolute path, exact byte count and SHA-256. The source hash includes its original BOM, line endings and whitespace. The output hash covers the complete pretty-printed plan and final newline. The entire receipt is bounded to 1 MiB before publication.

- Exit 0 means both the new complete plan and the receipt were delivered.
- Exit 2 means argument, source-read/parse, semantic or prepublication size refusal.
- Exit 1 means publication, source recheck, cleanup or receipt-delivery failure. A complete plan can already exist if cleanup or stdout delivery fails afterward. Do not infer absence from a nonzero result.
- Standalone help returns 0 only after full stdout delivery; delivery failure returns 1. Failure diagnostics are best effort and never convert failure into success.

No schedule is installed and no rules are automatically evaluated later. Each month requires another explicit generation and review. No ledger, budget, account, provider or existing plan is changed.
