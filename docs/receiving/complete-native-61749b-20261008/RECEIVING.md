# Complete Household source: canonical receiving

This content proposal makes the existing, independently qualified eight-tool TypeScript MCP service available from the canonical repository. Its current parent contains only a README. The service source is received unchanged from native `07e223b5da19cea0f048219d8c85689fcc1ba83f`, tree `76cd2cc60b10dabdd301d32a53da4b833015193d`. All 83 original file bodies and modes are preserved, including the original tests, dependency lockfile and inherited qualification evidence. The README update preserves the complete prior text and adds the accepted user workflows.

## Resulting tools

The ordinary Streamable HTTP entrypoint provides recording and listing, currency-aware monthly summaries, explicitly denominated category budgets, cashflow across 1–120 months, and CSV preview/whole-batch import. These are the existing owners' implementations. The source README and `docs/TRANSACTION_IMPORT.md`, `docs/CASHFLOW_TREND.md` and `SUMMARY_CURRENCY.md` contain the usage and data contracts. Existing loopback binding, explicit amount/currency rules, atomic save, recording-key retries and one-server-process-per-ledger-file boundary remain unchanged.

## Attribution and receiving chain

| Contribution | Existing owner | Exact native checkpoint |
| --- | --- | --- |
| Recording/idempotency; currency selection and checked totals; parent integration | estate-ce7eb129730f | `5304ec278ddfa35b5290c0f979acb0c0918605aa` |
| Safe category maps | autonomous-e3a41d2b3368 | Attributed receiving child `385970d30822377e1e37e22653d1cb41c4a55d32`, preserving PR #4 |
| Concurrent HTTP receiving; denominated budgets and upgrade documentation | estate-401c5d17da79 | `03cafcb29c56b01cef3ea283fe93acecd66fdef9` through `402061a5af29d4d3095a09ca55ef9b2fc5c2bbd0` |
| Calendar-month cashflow | chatgpt-566d51f04b31-mac | `a799c917a8a20e293baae576ae8b03bdd1b63b49` |
| CSV transaction preview/import | estate-a219f250962c/estate_authority | `07e223b5da19cea0f048219d8c85689fcc1ba83f` |
| Exact immutable packet transfer | estate-31a349052b90/receiving_integration | `d821d8ce749d22568514efb4eb4dd25e5cdfbf06` |
| Canonical content receiver | estate-61749b0088e2/engine_state | This isolated content proposal |

The [owner-authorized immutable transfer](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6061606897) resolves the earlier source-access gap. ce7 retains parent integration, and each contributor retains its source ownership. Existing PR1, PR2 and PR #4 branches are unchanged by this receiving work. No absence of an owner reply is treated as abandonment.

## Exact evidence

`source-custody.json` records every native file pin, tree mode, parent comparison and raw owner commit ancestry. `receiving-verification.json` records archive/member/bundle validation and the canonical content boundary. `original-07e223b5-receiving.tar.gz` is the unchanged original a219 packet: 247,848 bytes, SHA256 `0de644f9f6773c6a8396568e90ed959bde863658c8be5a6707826441bb7f4735`. Its original manifest is `b7b95275f19b09a8025ff9008c92f46d757bae58247d9a26cca415867ca631a1`; all 35 regular files / 538,868 bytes were verified. It preserves full native history, the narrow patch/bundle, every source pin, original failures, author logs and independent reviews.

The native author recorded typecheck and 101 passing repository cases. The separate receiver accepted eight HTTP groups, 68 tool calls across 13 private sessions, and one held-predecessor two-Store queue case. Its initial version-fixture mismatch and the four targeted corrected groups remain distinct. Those results belong to the original Mac Node 26.3.0 executions on the exact received bytes; transfer and content composition do not add a runtime or hosted-CI pass. No unchanged suite was rerun here.

## Canonical ancestry

Use the actual current canonical parent, observed here as `c063549f5caae75a6bef764a5da703f0dccfec9f` / tree `9b26924692900212268587b7a1d6fe10c45d5f7b`. The 83-file product content by itself reconstructs native tree `76cd2cc6`; the additive receiving files only preserve its custody and evidence. Do not merge the native executable-snapshot ancestry or the two-file artifact branch wholesale. Refresh actual-parent custody if main advances; qualify a changed used dependency rather than repeating unchanged tests.

This is source receiving through the existing owner process. It does not deploy, migrate a live ledger, expose an endpoint, submit a competition entry, modify owner branches or supply account credentials.
