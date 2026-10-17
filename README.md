# Household Ledger MCP

TypeScript service for recording household income and expenses, listing/filtering transactions, monthly summaries, and category budgets. It uses the official typed `@modelcontextprotocol/sdk` and implements **MCP 2025-11-25 over Streamable HTTP** at `/mcp`. Amounts are integer minor units; the data file is validated and atomically persisted as local JSON.

## Run locally

- Node.js 20+
- `npm ci`
- `npm run typecheck`
- `npm test`
- `HOUSEHOLD_LEDGER_DATA_PATH="$HOME/.local/share/household-ledger/ledger.json" npm start`

By default the Streamable HTTP service binds only to `127.0.0.1:3000`, with `GET /healthz` as a local health check. It intentionally rejects non-loopback binds until authentication and deployment controls are implemented. Set `HOUSEHOLD_LEDGER_PORT` to change the port. `npm run start:stdio` remains available for local process-spawned development only.

For clients sharing a ledger file, connect them to the same running server process. Allow outstanding writes to finish and stop any older service using that file before starting an upgraded service.

## Transactions, summaries and budgets

Call these tools through a connected MCP client. Dates use `YYYY-MM-DD`; budget months use `YYYY-MM`. Amounts and limits are safe integers in the selected currency's minor units. A transaction amount must be positive; a budget limit may be zero.

| Tool | Purpose |
| --- | --- |
| `record_transaction` | Record income or an expense with its amount, currency, date and category. An optional `idempotencyKey` preserves the original transaction on an identical retry. |
| `preview_transaction_import` | Review a complete CSV with exact normalized values, existing matches/conflicts and per-currency totals, without writing. |
| `commit_transaction_import` | Atomically record the reviewed CSV using stable source keys; exact retries reuse original records and a conflict refuses the whole batch. |
| `list_transactions` | Filter and page the recorded transactions. |
| `monthly_summary` | Return one currency's income, expenses, net amount, category totals and applicable category budgets. |
| `cashflow_trend` | Compare 1–120 inclusive calendar months in one currency, including empty months, monthly budgets and cumulative period net. |
| `set_budget` | Create or replace a category/month limit, optionally with an explicit currency. |
| `get_budgets` | Inspect a month's budgets, optionally filtering the explicitly denominated records by currency. |

See [cashflow trend usage](docs/CASHFLOW_TREND.md) for interval selection, currency rules and the distinction between cumulative period net and an account balance.

See [CSV transaction import](docs/TRANSACTION_IMPORT.md) for the required source columns, preview/review/commit flow and retry rules.

For an existing saved ledger, [discover its recorded months](docs/LEDGER_MONTHS.md) with `node tools/household-months.mjs --ledger /path/to/ledger.json` after building. This offline read-only helper does not start the server or modify financial records.

### Separate limits for each currency

For a category/month that has no existing unassigned budget, call `set_budget` with an explicit currency:

```json
{"category":"groceries","month":"2026-10","limitMinor":50000,"currency":"USD"}
```

An additional call with `"currency":"EUR"` creates a separate limit for the same category and month. Updating the USD limit preserves the EUR limit. Currency inputs are normalized to uppercase; amounts are never converted between currencies.

Select the currency when calling `monthly_summary`:

```json
{"year":2026,"month":10,"currency":"USD"}
```

The response includes `currency`, `incomeMinor`, `expenseMinor`, `netMinor`, `byCategory` and `budgets`. Each applicable budget includes its category, limit, expenses counted as `spentMinor`, `remainingMinor`, and `over`. A denominated budget also includes its own `currency`. This example selects USD transactions and USD-denominated limits; unassigned budgets follow the separate rule below. An explicitly selected currency with no transactions can still show its budget with zero spent.

If a month contains multiple currencies among its transactions or denominated budgets, omitting the summary selector returns a validation error. With one available currency, the summary can select it automatically. The response uses `currency: null` for a month with no transactions, no budgets and no selector.

To inspect budgets without calculating a summary, call `get_budgets`:

```json
{"month":"2026-10"}
```

This lists all currencies and any unassigned records. Adding `"currency":"USD"` filters the list to explicitly USD-denominated budgets; unassigned records are excluded from that filtered view.

### Explicitly assigning an existing budget

Older budgets have no `currency` field. They retain their existing rule: a monthly summary can compare them only when the month's transactions have exactly one currency and that currency is selected. Mixed-currency months, empty months, or a different selector require an explicit assignment first. A partially assigned month can still be blocked by its remaining unassigned budgets; a successful read never changes those records.

Inspect the existing budget with unfiltered `get_budgets`, decide its currency and intended limit, then call `set_budget` with both `currency` and `replaceUnassigned: true`:

```json
{"category":"groceries","month":"2026-10","limitMinor":50000,"currency":"USD","replaceUnassigned":true}
```

That call replaces the matching unassigned category/month budget with the explicitly requested currency and limit. The supplied amount is the new limit; the service does not infer a currency or convert the old number. Without `replaceUnassigned: true`, attempting that assignment returns a validation error. Omitting `currency` cannot overwrite an already denominated budget.

The first successful denominated-budget write saves ledger format version 2. Version 1 files remain version 1 while they are only read or used through unassigned-budget operations. Existing unassigned records in other categories or months remain present after the version change, and transaction IDs and idempotency keys are retained. Earlier service versions reject version 2 files; continue using the upgraded service after assigning a budget. Validation failures and failed atomic writes preserve the prior file.

## Competition readiness

This is an unsubmitted local prototype. Source repository: https://github.com/Jacob-Met/household-ledger-mcp (public; MIT License). It is not onboarded to Alexa+: it has no public HTTPS endpoint, OAuth 2.1/PKCE, Protected Resource Metadata, privacy/terms URLs, Alexa add-on manifest, certification, or demo video. This task did not register or join a Devpost account, and no entry was submitted; existing Devpost identity/join state remains unverified. Do not expose this unauthenticated loopback server to the network.
