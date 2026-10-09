# Recurring expense rule editor

Open `web/recurring-rule-editor/index.html` in a current browser. It is a single offline page with its script and styles embedded. It needs no server, account, network connection or browser storage.

Use this workspace to create a `household-recurring-expenses/1` rule file for the existing monthly-plan generator. The page does not generate dates, calculate a month's total, record transactions, schedule payments or alter a ledger. A saved rule file is a reusable input, not an expense plan.

## Create and save rules

1. Enter a three-letter currency code and choose **Apply currency**. The workspace keeps the admitted spelling, including surrounding whitespace. The downstream generator normalizes the code.
2. Choose **Add rule**. Give it a unique ID, a real start date, category and positive integer amount in minor units.
3. Choose **Weeks** or **Months**, and an explicit interval. Monthly rules also require an explicit missing-day choice: skip that month or use its last day.
4. Optionally enable an inclusive end date or a note. A note that is absent differs from an enabled but empty note.
5. Choose **Apply rule**, then **Save rule file**. Keep the downloaded JSON yourself.

Amounts are integers from 1 through 9007199254740991. Enter digits only; `12.50`, signs, leading zeroes and exponent text are refused in the form. The form does not assume how many minor units make one major unit for a currency.

Rule IDs distinguish case and Unicode spelling. IDs must contain 1–128 Unicode code points, have no leading or trailing whitespace, no C0/DEL control characters and no unpaired surrogates. Currency must trim to three ASCII letters. A category must contain non-whitespace text. Weekly intervals are 1–52; monthly intervals are 1–120.

**Edit**, **Move earlier**, **Move later** and **Remove** operate on the selected row. Order is retained when saving and can matter to the producer's order for equal-date occurrences. Removal affects only the unsaved workspace. There is no automatic save or undo history.

While a rule form is open, choose **Apply rule** or **Cancel changes** before saving or opening another file. Currency changes require **Apply currency**. Reloading or closing the page discards unsaved work.

## Open, preview and replace

**Open rule file** opens the browser's file chooser. The complete admitted document appears in a literal JSON preview, with its filename and source byte count. Your current rules remain unchanged.

Choose **Replace current rules** to adopt that preview, or **Cancel preview** to keep your work. A new Open, an edit, cancellation or leaving the page retires an earlier read or preview. Replace also checks the full current control values, so a stale preview cannot silently overwrite changed inputs. File errors preserve the current document.

Files are limited to 1 MiB, 100 rules, a shallow bounded JSON structure and the exact schema. Unknown keys, duplicate JSON property names, duplicate IDs, invalid UTF-8, invalid fields and excessive bounds are refused. One leading UTF-8 BOM is accepted. The same 1 MiB encoded-size limit applies to Save.

Saving produces two-space-indented JSON followed by one LF. Property order is canonical: root `schema,currency,rules`; rule `id,start,end?,category,amountMinor,note?,repeat`; repeat `unit,every,missingDay?`. This preserves admitted values, optional presence and rule-array order, not the original file's indentation or property order.

## Literal text and edits

Imported currency, category and note strings stay in a separate document model. An untouched field keeps its exact original code units, including mixed CR/LF line endings, empty strings and JSON-escaped controls. Each row's **Complete literal rule** disclosure shows these distinctions.

Browser text controls can normalize line endings when text is edited. Editing a field adopts that control's text; it does not promise to preserve the old field's raw line endings. Editing only an amount preserves an untouched imported note. Toggling an optional note off explicitly removes it. Category and note values are rendered as text, never as HTML.

The page has no local storage, network requests or automatic downloads. Download permissions and the final filesystem destination remain under the browser's control.

## Generate one month separately

Use the existing released producer after saving, with its normal build/runtime available. For example:

```sh
node dist/src/household-recurring-plan.js --rules household-recurring-rules.json --month 2026-11 --out november-plan.json
```

The output path must be new. Keep the producer's complete receipt, including normalized currency. The plan JSON itself contains no currency; supply the receipt's currency explicitly when using the existing expense-plan preview. Opening the editor or saving a file does not invoke either command.

Format admission does not establish that every requested month can be generated: a month may exceed the producer's occurrence or total limits. This editor leaves date expansion, monthly limits, normalization and plan publication with the unchanged producer. Fictional examples are format demonstrations.

## Source and checks

This additive editor consumes the schema from released Household Ledger source `57268bfda9643f641852468ae459fb61b1080b6e`. The recurring generator, ledger, preview, calendar, comparison and existing platform recipients are unchanged.

Rebuild the standalone page with:

```sh
node scripts/build-recurring-rule-editor.mjs
node scripts/build-recurring-rule-editor.mjs --check
node --test test/recurring-rule-editor.test.mjs
```

The maintained browser check requires Node 22 or newer (for its built-in WebSocket), an existing Chromium executable, a new output directory and its own profile. Opening the standalone editor itself requires no Node runtime:

```sh
CHROME=/path/to/chrome node tools/check-recurring-rule-editor.mjs web/recurring-rule-editor/index.html /new/receiving-directory
```

Use a short private temporary directory for Chromium's platform sockets. The check records actual file chooser admissions, physical JSON downloads, screenshots, raw browser diagnostics and cleanup. It includes one explicitly labeled delayed-file-read fault injection. Its fixtures are embedded; it does not need a private author workarea. It does not run the recurring producer.

The editor's model checks and browser checks qualify this input-editing surface. They do not substitute for the released producer's arithmetic tests, a financial assessment or live account acceptance.
