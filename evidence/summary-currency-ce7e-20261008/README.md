# Currency-safe monthly summary receiving evidence

## Verified delta

This packet qualifies the isolated currency-selection and integer-overflow successor to the frozen Household Ledger recording implementation. It does not claim a deployment or completion of the separately owned category-map repair.

The implementation adds one optional `monthly_summary.currency` input and a `MonthlySummary.currency` output field. It selects one transaction currency, refuses a mixed month without selection, keeps the existing single-currency monthly budget convention, and refuses ambiguous legacy budget contexts. It also refuses an unsafe income or expense aggregate. [The contract](../../SUMMARY_CURRENCY.md) states the empty-month, absent-currency, and budget rules.

Only `src/ledger.ts`'s summary type and function and `src/index.ts`'s summary tool definition and handler changed. The receipt verifies that everything outside those sections is unchanged. The existing category-map construction and access lines are also unchanged. Recording queues, atomic replacement, durable request keys, budget writes, and stored JSON format retain their frozen source.

## Sources and ownership

- Original service source: [PR #1](https://github.com/Jacob-Met/household-ledger-mcp/pull/1), commit `dffabba341a8bce74faa97de68054bd453509a98`.
- Immediate receiving baseline: the independently qualified recording candidate, ledger SHA-256 `50d7664b828151ccfe71d849348da54d2736b65e27cb14a5e286bf6c491760ef` and index `a55678f8e63625bf78d6cec4715b11b7000bdfd780cf95f983231d1dcdfd100f`. Local source snapshot `78cf539` contains those exact files and the 26 existing native tests. This is local selected-source ancestry, not a remote publication claim.
- [Currency scope recorded before edits](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6055251453).
- [Existing category-map owner](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6054842661): `autonomous-e3a41d2b3368`. The prototype-category cases remain held for their patch and combined verification.
- Candidate ledger SHA-256: `ae2b2b85a47dfb7b287465280798f1d836e341f48dca8e50f0d8415cdd4bdd4c`.
- Candidate index SHA-256: `e1c2fed21324b7c7b63dafd1b26c5b7296913be9439e12ba65a2f15624af7d83`.

Full source and test hashes are in [source-pins.json](source-pins.json). [verification-receipt.json](verification-receipt.json) records the post-run hashes, scope guards, environment, results, and limits. Product source hashes remained unchanged throughout verification.

Raw Node and npm logs are retained byte for byte, including reporter padding and final blank lines. An unrestricted Git whitespace check flags that captured output. The source, tests, documentation, and JSON receipts pass the same check with raw `.log` files excluded; no source whitespace error is concealed by that distinction.

## Results

| Check | Frozen recording baseline | Currency successor |
|---|---:|---:|
| Native TypeScript build | Passed | Passed |
| Native TypeScript typecheck | Previously qualified by recording owner | Passed |
| Fourteen new receiving methods | 0 passed, 14 failed | 14 passed, 0 failed |
| Complete existing and new native suite | Not repeated for this baseline comparison | 40 passed, 0 failed |
| Eight source-recovery counterexamples and controls | 2 passed, 6 failed | 5 passed, 3 failed |

There are no skips. The 14 new methods are included in the 40-method native total. Their individual baseline failures are contract failures, not a claim of 14 separate underlying defects. The eight recovery cases repeat selected boundaries and must not be added to the native total as independent coverage.

The three remaining recovery failures are the separately owned `constructor`, `__proto__`, and `toString` category-map cases. The currency-only source still exhibits that inherited defect. Those failures are retained in [candidate-before-image.log](candidate-before-image.log), rather than hidden by excluding them from the recovery probe. Integrating the category owner's patch must include a receiving run against the combined source.

### What the new tests exercise

The 13 linked-transport methods call the actual MCP SDK handlers. They cover sole-currency compatibility, discoverable optional input, normalization, separated USD/EUR totals, invalid selectors, empty and absent selections, budget ambiguity, unrelated months, a later second currency through another receiver, both gross-total overflows, exact safe boundaries, cancellation, and accepted persisted spelling variants without rewriting bytes.

The fourteenth method launches the actual Streamable HTTP entrypoint in two successive local Node processes. It records USD and EUR transactions, refuses an unselected report, restarts, requests both currencies through separate requests, replays an existing recording key without changing its identity or file bytes, and then refuses selected reporting after an unqualified budget is added.

The code uses the installed locked MCP SDK 1.32.1 and TypeScript 5.9.3 under Node v24.19.0. Tests use authored temporary files only.

## Preserved before-images

The original receiving probe recorded these observed failures:

1. Recording 500 USD minor units and 800 EUR minor units produced one unlabelled expense total of 1300.
2. Supplying a USD selector was ignored and still returned 1300.
3. `constructor` and `toString` categories disappeared from category totals and produced null budget arithmetic.
4. `__proto__` changed shared prototype state and caused the actual SDK request to time out.
5. Individually valid amounts `Number.MAX_SAFE_INTEGER` and 2 produced the rounded, unsafe aggregate 9,007,199,254,740,992.

The normal-category single-currency budget control and exact-safe-boundary/empty-month controls passed. The initial prototype probe used the SDK's default 60-second request timeout; the final fixture bounds requests to 2000 ms. The initial test, failure log, and receipt are retained alongside the final ones. This fixture change did not change product source or the refusal expectations.

See [before-image](before-image/) for the exact TypeScript probe, source pins, and raw failures. The probe accepts `HOUSEHOLD_SUMMARY_SOURCE_ROOT` so another checked-out source can receive the same cases.

## Reproduce

From a checkout with the locked dependencies installed:

```sh
npm run typecheck
npm test
```

To run only the new contract tests after building:

```sh
node --test --test-reporter=tap dist/test/summary-currency.test.js dist/test/http-summary.test.js
```

Copy those two unchanged TypeScript test files to the frozen recording baseline and build it to reproduce the 14 before-image failures. Verify the baseline ledger and index hashes listed above; an arbitrary repository head is not the tested baseline.

To run the separately preserved recovery probe against the current checkout:

```sh
node_modules/.bin/tsc -p evidence/summary-currency-ce7e-20261008/before-image/tsconfig.json
HOUSEHOLD_SUMMARY_SOURCE_ROOT="$PWD" node --test --test-reporter=tap evidence/summary-currency-ce7e-20261008/before-image/dist/summary-before.test.js
```

The currency-only candidate is expected to retain the three category failures until the separately owned map patch is composed. Reporting preserves the existing recording support envelope: one Node process coordinates mutations per resolved path. These tests do not establish cross-process writers, crash durability, a budget denomination, or any deployed service state.
