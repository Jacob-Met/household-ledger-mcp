# Explicitly denominated category budgets

This packet qualifies the native successor to receiving source `03cafcb29c56b01cef3ea283fe93acecd66fdef9`. The exact runtime and new tests are committed at `0b24be16a06b0379062219a589fb4533acbe54a7`. Subsequent usage documentation and evidence changes preserve those runtime bytes. Ownership is recorded in Household Ledger issue 3, comment 6057422383.

The capability completes category budgeting for months that contain more than one transaction currency, and permits planning an explicitly denominated budget before the first transaction. `set_budget` accepts `currency`; its identity is category, month and denomination. An existing unassigned budget requires an explicit `replaceUnassigned: true` request with the intended currency and new limit. Successful denomination promotes the file to version 2. Reads, refused requests, unrelated unassigned records and existing transaction identities retain their prior behavior. README and SUMMARY_CURRENCY contain the user-facing contract.

## Native qualification

The original test sources are unchanged. The added `test/budget-currency.test.ts` uses the actual MCP SDK's linked transports and the persisted store. It covers scoped limits, unspent months, selectors, explicit assignment, partial migration, no-write retries/refusals, malformed storage, reserved category names, exact amount boundaries and preservation of unrelated data.

- New feature suite: **11 passed**, no failures or skips.
- One combined repository gate: **62 passed**, no failures or skips.
- Prior-source feature expectations: 11 fail because the original service does not implement denomination. The retained log is a feature-absence control; it is not a claim that the previously accepted source regressed.
- Prior-reader compatibility: the actual compiled `03cafcb` LedgerStore and MCP recording handler both refuse a native version-2 file. Its exact bytes remain unchanged.

The dependency installation was reused read-only: Node 24.19.0, TypeScript 5.9.3, MCP SDK 1.32.1, with the existing lockfile unchanged. The temporary checkout and test data used an isolated memory filesystem because the shared container volume was full; no other worker's files were removed or modified.

To run the repository suite with its existing dependency instructions:

```sh
npm ci
npm test
```

## Independent receiving

The separate integration worker froze the same runtime and passed three actual SDK Streamable HTTP scenarios: 46 recorded assertions, 34 tool calls through five child processes, and two restarts. The scenarios preserve ambiguous version-1 bytes, check keyed transaction retries/conflicts, deliberately assign and partially migrate budgets, keep concurrent USD/EUR limits separate across restart, and inject one declared filesystem rename failure. That failure leaves the original version-1 file intact and removes the failed temporary write; subsequent queued mutation, exact assignment retry and process restart succeed. The copied report is unchanged; its original runner, exact source copies and raw process evidence are preserved in the independent packet referenced by `source-inputs.json`.

These results concern one service writer and its existing serialized persistence queue. This contribution adds no coordination between separately running service processes sharing one data path. The old-reader check proves a fresh old-version read/write request is refused after promotion.

The source is implemented and verified. This packet does not assert that the repository owner has integrated it, that a service was deployed, or that competition/onboarding status changed.
