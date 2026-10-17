# Discover the months in one saved household ledger

Owner: continuing HAMON team d3745ea0f44f / Loom. This public contract is frozen before implementation. Root receives the command independently. Existing ce7 source-parent, 61749 canonical integration, category discovery #26, transaction lookup #23 and all other source owners retain their scopes.

## Beneficiary and exact source

The existing monthly summary, budget and two-month comparison consumers require a caller-selected month. This command shows which month keys are actually present in an explicitly selected saved ledger, including budget-only months. It does not fill gaps, choose a month, total amounts or modify records.

Qualified source is PR8 commit `591ab6f5a2d65bf596aeb707dbb635ee981ec926`, tree `bf7d8bedaa3ed02665e56b021f543259b8c4a854`. The unchanged native validator is `src/ledger.ts`, Git blob `2ff8133404f19c705eb7b7f0a943e8190f3328d6`. Canonical main remains README-only `c063549f5caae75a6bef764a5da703f0dccfec9f`; this is an isolated additive contribution over the complete qualified source, not an adopted main checkout.

Four new product paths only:

- `tools/lib/ledger-months.mjs`
- `tools/household-months.mjs`
- `test/ledger-months.test.mjs`
- `docs/LEDGER_MONTHS.md`

No existing source, Store, schema, index/MCP handler, package, lock, compiler configuration, README, test, workflow or installed file changes. The standard parent build supplies `dist/src/ledger.js`; this command imports its unchanged `validateLedgerData` function. Its ordinary runtime is Node.js 20+ after the existing build. Author qualification may use Node 24's recorded standard TypeScript transform on the exact native ledger module; such receiving is not a TypeScript typecheck or full project build.

## CLI and complete result

From the source root, after the parent's ordinary `npm ci` and `npm run build`:

```sh
node tools/household-months.mjs --ledger /absolute/or/relative/ledger.json
```

Exactly one `--ledger` with a nonempty path is required. `--help` alone prints concise usage and exits 0 without opening a ledger. Duplicate, unknown, missing and extra arguments refuse before input access. There is no output-file option and no implicit default ledger. Redirect only to a distinct caller-selected path, never the input.

Success exits 0 and writes one complete UTF-8 JSON object, two-space indentation and one final LF, to stdout; stderr is empty. Keys are inserted in the order shown. The original selector is retained literally as `source.path`; `source.bytes` and lowercase SHA-256 describe the complete raw input bytes. No absolute-path normalization is substituted into this field.

```json
{
  "schema_version": 1,
  "kind": "household.saved-months",
  "source": {"path": "ledger.json", "bytes": 123, "sha256": "..."},
  "counts": {"transactions": 2, "budgets": 1, "months": 1},
  "months": [
    {
      "month": "2026-10",
      "summary_supported": true,
      "transaction_count": 2,
      "budget_count": 1,
      "unassigned_budget_count": 0,
      "currencies": [
        {"currency": "USD", "transaction_count": 2, "income_count": 1, "expense_count": 1, "budget_count": 1}
      ]
    }
  ],
  "notice": "Recorded month keys from this saved ledger only. Counts describe saved row occurrences, not unique purchases or account completeness. Currency groups do not convert or total amounts. Legacy unassigned budgets retain no currency. Discovery does not imply that an existing monthly summary will accept the selected ledger and currency."
}
```

Month rows are ascending by their exact admitted `YYYY-MM` strings. Only keys present in `transaction.date.slice(0, 7)` or `budget.month` appear. Missing months are not invented. Repeated saved transactions, including repeated IDs, and repeated allowed legacy budgets count as separate occurrences. Counts are computed from the unchanged admitted arrays; there is no deduplication.

Currency groups are the ascending ASCII union of transaction currencies and explicitly denominated budget currencies, normalized to uppercase exactly as the existing monthly consumer does. Each group counts transaction type occurrences and explicit budget occurrences; zero counts remain explicit. A budget without a currency contributes to the row's budget count and unassigned count, never to an invented currency group. A budget-only unassigned month has an empty currency array. Global counts include all admitted rows and exactly the displayed month count. No IDs, notes, categories, amounts, balance, inferred chronology or payment status are emitted.

The native validator admits transaction years below 1970 and budget keys such as `0000-01`, while `monthlySummary` admits years 1970 through 9999. Preserve these exact admitted keys and set `summary_supported` solely from that year range. This flag describes the calendar-year argument boundary only; other existing monthly-summary currency/legacy-budget rules can still refuse. Do not silently discard, rewrite or newly reject such native data. The notice retains this distinction.

## Admission, read-only behavior and errors

The CLI admits arguments first, then opens the selected existing file for reading and requires a regular file. An ordinary filesystem symlink to a regular file is allowed and the literal selected path remains in provenance. It reads at most 16 MiB plus one refusal byte, requires a complete input of at most 16 MiB, decodes strict UTF-8 and parses JSON. Invalid UTF-8, malformed JSON and non-regular/missing input refuse. There is no missing-file initialization or directory creation.

Call the unchanged complete native `validateLedgerData` before projecting any rows, so a malformed neighboring transaction or budget cannot become a successful partial list. Unknown fields retain the native validation policy and are not projected. Inputs are JSON data, not arbitrary JavaScript getters/proxies. After complete native validation, refuse more than 100,000 transactions plus budgets combined. No partial row list is emitted on admission, validation or count-limit failure.

All ordinary usage, input, validation and stdout-write failures exit 2 with a diagnostic on stderr. Before a stdout-write failure, output may already be partial; there is no rollback or atomic stdout guarantee. No filesystem output, service request, ledger mutation, automatic retry, account access or dependency acquisition occurs in the command. Reading does not prove a stable snapshot against concurrent noncooperating writers; stop writers when exact comparison matters. Successful missing-month absence refers only to this selected saved file.

## Small useful qualification

Freeze an original missing-command observation and an authored saved ledger before candidate source. Include an out-of-order mixed-currency month, a budget-only month, a gap, duplicate transaction IDs, Unicode strings and a legacy unassigned budget. Independently check complete exact JSON/counts/order/provenance. Receive a discovered eligible month with the unchanged native monthly consumer on a separate compatible fixture. Invalid neighboring data must refuse with no successful output; empty and legacy ledgers must remain useful. Exercise argument refusal, an occupied unrelated sentinel, input/source byte preservation and the stated input/row limits without a broad full-suite campaign. Independent receiving remains separate from author tests and any later installed workflow.
