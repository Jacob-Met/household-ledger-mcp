# Updating a legacy budget with duplicate entries

An update without a currency now refuses when more than one legacy budget matches the selected category and month. The command leaves every row unchanged and explains that it cannot choose a budget to update.

## Why the refusal matters

Older saved ledgers can contain two unassigned rows for the same category and month. Whole-ledger validation continues to admit these files. Before this correction, a call such as `set_budget` with category `groceries`, month `2026-10` and limitMinor `30000` silently updated the first matching row while leaving the second in place. The returned single budget did not identify that ambiguity.

For example, two saved limits of 10000 and 20000 previously became 30000 and 20000. With this correction the same request returns the existing validation-error response and both original values remain intact. Identical limits are still separate occurrences; requesting the existing amount does not establish which occurrence the caller intended.

This check applies only when currency is omitted. Assigning an unassigned budget to an explicit currency already required an unambiguous row, and that behavior is unchanged.

## Inspect before deciding how to correct the saved data

Use the existing unfiltered budget reader to inspect the complete selected month:

```json
{"month":"2026-10"}
```

The `get_budgets` response retains all rows, including unassigned entries and other currencies. A currency filter excludes unassigned budgets, so it is not suitable for locating this particular ambiguity. Preserve a copy of the original file and review the duplicate records and any retained extension fields before deciding which data is intended. This change does not delete or combine rows, choose a limit, assign a denomination, or provide an automatic repair operation.

If the selected category/month has one unassigned row, the original update remains available:

```json
{"category":"groceries","month":"2026-10","limitMinor":30000}
```

A missing scope still creates a budget. A zero limit is valid. Duplicate rows in an unrelated category or month do not block an otherwise unambiguous operation. Request category trimming remains unchanged; the guard does not rewrite stored labels or broaden exact stored-category matching.

Explicit currency assignment still requires the original `currency` and `replaceUnassigned: true` choices, and still refuses multiple unassigned matches. Denominated updates, multi-currency behavior, amount validation, whole-ledger reading, monthly summaries and transaction retry semantics remain unchanged. Readable legacy duplicates do not become an automatic migration or a new financial conclusion.

## Implementation and tests

The sole production change is one assertion in the omitted-currency branch of `src/ledger.ts::setBudget`, after its existing denominated-budget refusal and before selecting `unassigned[0]`. It throws the existing `ValidationError`:

```text
multiple unassigned budgets match this category and month; cannot choose a budget to update
```

No Store, schema/version, MCP dispatch, package, lockfile, workflow or other helper changes. A callback refusal through unchanged `LedgerStore.update()` propagates without calling its save step. Its existing process-local queue remains usable for a later valid update. This is not a new cross-process lock, race guarantee or repair mechanism.

After the project's normal dependency setup and build, the focused test entry is:

```sh
npm run build
node --test dist/test/budget-unassigned-ambiguity.test.js
```

The eleven named tests cover both ledger versions, unequal/equal/no-op duplicate cases, repeated references, readable legacy inputs, exact object/reference preservation, zero/unique/absent scopes, unrelated scopes, original explicit-currency and argument-error behavior, and a real temporary Store refusal followed by a valid update. The Store check compares raw bytes, device/inode, mode, size, nanosecond modification time and directory contents before recovery; only the deliberate later update may write.

The original witness and author receiving use existing Node 24.19.0 and its experimental built-in TypeScript transformation in an owned temporary projection. The author transforms the exact source and test bodies to JavaScript, then executes Node's actual test runner. The runtime warning and full streams are retained. This proves that specific native domain/Store course; it is not a strict TypeScript compiler/typecheck, Node 20, MCP transport, live ledger or installed-service claim. The normal build commands above remain the maintained project route, not an assertion that they ran for this contribution.

## Source offer and existing ownership

Issue41 is based on complete draft PR8 commit `591ab6f5a2d65bf596aeb707dbb635ee981ec926`, tree `bf7d8bedaa3ed02665e56b021f543259b8c4a854`. Original ledger module: Git blob `2ff8133404f19c705eb7b7f0a943e8190f3328d6`, SHA-256 `743eb94413383d8872b2eb4670d2813c2924d78cf9ae0d2b479432f9e8ae8c07`.

Canonical main is still README-only at the reservation. Existing ce7 source-parent disposition and 61749 canonical/sibling integration remain in force. The 401c denomination changes, 847ff reviewed setter, #19 removal, #32 batch setting, #35 UTF-8 reader, #36 Windows queue and #37 date-range corrections keep their own scopes. Compose this single assertion with advanced owner source deliberately; do not replace the complete module from an older parent and erase another contribution.

This is an isolated reviewed source offer. No default-branch adoption, deployment, workflow run, real household edit or financial authority is implied. The package preserves the original failing behavior and separates author, independent and publication evidence.
