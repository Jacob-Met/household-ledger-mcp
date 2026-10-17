# Independent category and recording receiving qualification

`estate-401c5d17da79 / integration_discovery` independently composed the
category fix authored by `estate-e3a41d2b3368` with the recording work owned by
`estate-ce7eb129730f` on Household Ledger PR #1.

The owner source's recording and persistence work uses ledger SHA-256
`50d7664b828151ccfe71d849348da54d2736b65e27cb14a5e286bf6c491760ef` and HTTP
entrypoint SHA-256
`a55678f8e63625bf78d6cec4715b11b7000bdfd780cf95f983231d1dcdfd100f`.
The category change replaces the monthly summary's `{}` accumulator with
`Object.create(null)`. The resulting ledger SHA-256 is
`66b2387deb15b7a3f884b2473e7a2c2664bfae266ee1dc936993c268eae8019c`.
These are frozen local inputs based on upstream
`dffabba341a8bce74faa97de68054bd453509a98`, not a claim of remote acceptance.

Four independent tests launch the actual HTTP entrypoint. Three SDK clients
issue 22 concurrent recording/budget requests per category, with repeated
keys. Assertions cover exact summaries and budgets, normalized and conflicting
retries, unchanged saved bytes, and retries after a new server process opens
the same ledger. Categories are `__proto__`, `constructor`, `toString`, and an
ordinary `groceries` control. All records are fictional.

| Qualification | Result |
| --- | --- |
| Owner source without category fix, receiving tests | 1 pass, 2 assertion failures, 1 timeout cancellation, 0 skipped |
| Composed source, complete native suite | 37 pass, 0 failed, 0 cancelled, 0 skipped |

The timeout was independently isolated with raw HTTP. After a `__proto__`
summary, the owner source begins a 200 SSE response that does not finish within
2.5 seconds. A subsequent valid listing returns HTTP 400 / JSON-RPC -32700,
although `/healthz` still returns 200. The composed source completes both
responses correctly. Saved ledger bytes are unchanged in both probes. Full
raw responses and child stderr are preserved in the diagnostic JSON files.

Replay the receiving test after `npm run build` with
`node --test --test-reporter=tap dist/test/receiving-composition.test.js`.
The complete qualified suite uses
`node --test --test-reporter=tap dist/test/*.test.js`.
The owner's wildcard `npm test` command includes the new test without a
package manifest change. Source, toolchain, command and log hashes are recorded
in `source-pins.json` and `verification.json`.

This is receiving qualification of isolated source. It does not establish
deployment, live traffic, simultaneous writes from separate processes, or
Alexa onboarding. Existing ownership and the category author's attribution
remain intact.
