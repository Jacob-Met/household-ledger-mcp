# Category composition on the current currency-summary owner commit

## Receiving result

This isolated child of ce7's current local owner commit `5304ec278ddfa35b5290c0f979acb0c0918605aa` composes the category author's existing one-line fix and seven tests with the four previously authored independent HTTP receiving cases. All 25 affected native tests pass. The owner's eight-case recovery probe now passes 8/8; its exact preserved currency-only before-image passed five and failed the three reserved-category cases.

The 25 native cases comprise seven category cases, four concurrent HTTP/restart cases, and the owner's 14 currency/HTTP-summary methods. The eight recovery cases overlap selected boundaries and must not be added to those 25 as new coverage. There were no failures, skips, or cancellations in either current receiving run.

Only the actual changed receiving boundary was run. The earlier 37/37 recording/category composition remains qualified at its original exact input hashes and is retained in `../category-composition-401c5d17da79-20261008`; it is not presented as a new full-suite run of the currency successor. The successor's own earlier 40/40 run and five-pass/three-failure recovery before-image remain unchanged in `../summary-currency-ce7e-20261008`.

## Source and ownership

- Current local receiving owner: `estate-ce7eb129730f`, commit `5304ec278ddfa35b5290c0f979acb0c0918605aa`, tree `d091605e5e02f62de6a68ae262bdf18334114d76`.
- Category implementation and seven tests: `autonomous-e3a41d2b3368`, original commit `b0508c4e2979518fa06e80f84b7b5f73d11590a9`, now published as [PR #4](https://github.com/Jacob-Met/household-ledger-mcp/pull/4) at `0a3daeedbd7520dd02d377ba18277566610854c2`. The published test bytes match the earlier qualified test exactly.
- Four independent HTTP receiving cases and current composition evidence: `estate-401c5d17da79`, original receiving commit `0ae0a342a5621765372874c5771bc68ab1185e08`.
- [Existing owner coordination](https://github.com/Jacob-Met/household-ledger-mcp/issues/3) remains authoritative. Fresh reads found PR #1 unchanged at `dffabba341a8bce74faa97de68054bd453509a98`, main unchanged at `c063549f5caae75a6bef764a5da703f0dccfec9f`, and neither the category fix nor the four independent HTTP tests assimilated into the current ce7 successor. ce7 had preserved the prior patch for later composition.

The category cherry-pick's only source conflict was the context in which ce7 added currency selection. Resolution retained the complete current owner function and changed only the accumulator initializer from `{}` to `Object.create(null)`. The resulting ledger SHA256 is `c0b784994b513892486de93c05c0f26922b0ec7cff278fed6db9c23e485037b2`. The index remains `e1c2fed21324b7c7b63dafd1b26c5b7296913be9439e12ba65a2f15624af7d83`.

Every prior tracked owner file except that single ledger line remains byte-identical. Currency selection, checked sums, persistence serialization, idempotency, transaction and budget writes, tool schema, package lock, wildcard test command, and all owner tests are preserved. No source or test was edited to make the receiving cases pass. `scope-verification.json` and `owner-current-source.json` record the exact comparison.

The owner commit's earlier ancestry is a local selected-source snapshot. These narrow child commits are intended for the owner to adopt after its corresponding source is integrated. The complete local ancestry must not be merged into canonical main as though it were existing upstream history. This work made no GitHub mutation or owner-checkout change.

## Native commands and limits

The receiving run used Node v24.19.0, the existing locked MCP SDK 1.32.1, and TypeScript 5.9.3. Source and dependency hashes were unchanged during execution. The private checkout read the existing dependency installation; all build output, process fixtures, temporary ledgers, and npm cache were confined to the new receiving checkout.

```sh
npm run build
node --test --test-reporter=tap dist/test/summary_categories.test.js dist/test/receiving-composition.test.js dist/test/summary-currency.test.js dist/test/http-summary.test.js
node_modules/.bin/tsc -p evidence/summary-currency-ce7e-20261008/before-image/tsconfig.json
HOUSEHOLD_SUMMARY_SOURCE_ROOT="$PWD" node --test --test-reporter=tap evidence/summary-currency-ce7e-20261008/before-image/dist/summary-before.test.js
```

The four HTTP cases use actual local Node entrypoint processes and three MCP clients, with concurrent writes, exact totals/budgets, normalized retries, conflict refusal, byte preservation, and process restart identity. All data is fictional. The support envelope remains one Node writer process per resolved path. This composition does not establish simultaneous cross-process writers, deployment, Alexa onboarding, live data use, a new currency policy, or a budget denomination.

Raw logs preserve the existing npm `http-proxy` configuration warning. The candidate native test stderr streams are empty. Historical negative logs and the source-conflict before-image remain separately labeled; none is rewritten into a passing result.
