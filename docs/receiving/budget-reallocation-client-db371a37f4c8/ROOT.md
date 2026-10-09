# Household budget reallocation client — independent root receiving

Owner: estate-db371a37f4c8. Author lane: production. Repository: Jacob-Met/household-ledger-mcp. Producer issue11; consumer issue15. Native host: hamon-thinkpad, uid1000, boot a5c2389c-3cf7-4b6a-b5cb-01dc0f82c5a4. Receiving completed 2026-10-09 00:40:47 UTC; final source, dependency and custody audit completed afterward.

## Decision and exact scope

ACCEPTED for existing-owner source composition and native adoption. The five additive files implement an interactive, explicit-review terminal consumer of the existing budget-reallocation producer. Root observed a real confirmed allowance change, refusal after a separate native writer changed the reviewed pair, honest reporting when the acknowledgement was lost after persistence, and a fresh review after a real server restart. This packet establishes source and native terminal qualification. It does not establish installation in the household aggregate, use with a live household ledger, or LA7 application admission.

The existing ce7/61749 household aggregate and producer owners retain their scope. The independent installed single-entry command extension belongs to issue13 and is a separate receiving contract; it is not included in this decision.

The owner no-GitHub-Actions direction remains controlling. No hosted gate was run for this receiving packet. Any publication must use freshly audited, demonstrably workflow-safe custody and the existing owner handoff. No source ref, PR, merge, service or installed state is changed by this report. Native-equivalent qualification and owner-led integration are authorized by the existing estate direction; this report does not convert an unrun hosted gate into a pass.

Authority: [no Actions](https://github.com/Jacob-Met/hamon/issues/143#issuecomment-6067592767), [native integration](https://github.com/Jacob-Met/hamon/issues/143#issuecomment-6069904551).

## Frozen contract and independence

[CONTRACT.md](CONTRACT.md), 4,089 bytes, SHA256 62dc69223ea51087557dc789bb48060538afba2503e70bd5852b8fbb8020a593, froze at 2026-10-08 22:57:47.021014 UTC before root read the original producer or candidate implementation/tests. The manual fixture and expected outcomes derive from that contract and the actual original producer.

The fixture uses October2026/USD, literal categories “Food / 東京” and “Rain reserve <&>”, original limits12000 and3300, and a2500 movement. Expected limits are9500 and5800; total15300 is invariant. Independent controls include another USD budget, the same category in JPY, the following month, a legacy unassigned budget, an existing expense with literal Unicode/newline text, and source/top-level metadata.

The expected review token is 70f68263a7bbbf307f48e3212ace99513570ea8dddfb006745da66845eadc289. Root established the original native oracle before reading the candidate runtime. [candidate-interface-binding-r1.json](candidate-interface-binding-r1.json) records the later interface binding, SHA25654bdc09ccf982f6a9160463d93cfea2f204cca0ada17181682c1af11e014ee73.

Root independently authored the native API and terminal assertions. Existing single-entry receiving supplied only already-qualified PTY and streaming-SSE mechanics; it did not supply the reallocation semantics or fixture. New authored test bodies were copied and hashed for source custody without being used to derive root assertions.

## Source composition

Original producer commit c83f0a6aee72df86eed17272ee8be6a79b7f941e, tree f039e5d078827746c896e5e167ba95299e48cd17, extends source parent591ab6f5a2d65bf596aeb707dbb635ee981ec926. [original-published-tree.json](original-published-tree.json) contains the complete138-entry recursive tree, including120 leaves. Root rebuilt Git's binary tree representation from all leaf modes and object IDs and independently obtained the original tree.

The executable receiving closure has26 original source/configuration/test/guide files,247365 bytes. All match the published producer objects. The final contribution contains31 source files and78 native compiler outputs; all109 files match the final author manifest.

| Additive path | Bytes | SHA256 |
| --- | ---: | --- |
| src/reallocation-client.ts | 10031 | a430da6e0ffc59ac4dc70a20eda0d76b7c02f02afe7fd0886496a08f94ae8545 |
| src/household-reallocate.ts | 5786 | b52b6c5c87d338504c2712bc8a7a31cd7c926f6b139787dc38210d52ca082ae5 |
| test/reallocation-client.test.ts | 4071 | 717b882d05155cf3373b8d3c0f4ad41b8f59956cee7b4545137c4f365ba9ea8f |
| test/reallocation-client-http.test.ts | 7603 | 7fdaccd879d852a5e1a5ab65582a9db04c826eb6a84d70bea301e8316e48d190 |
| docs/REALLOCATION_CLIENT.md | 3950 | 1f478cdf0e3b0e2defb8226850546f7df85e4e8f2cc241c85c1f8ca9d1c345b7 |

Adding those five native-hashed source objects to the unchanged120-leaf producer yields125 leaves and tree **5b88c9f61af7db76ed3489f6be9a3e65d2214ffe**. No original leaf changes. The full product tree is independently recorded in [final-audit-r1/full-product-tree-r2.json](final-audit-r1/full-product-tree-r2.json).

The narrow after-producer patch is32697 bytes, SHA256 bfdd32804d2b36e993caafdae6bb1f0b29d27884874c3ee133a8e3358ab926d4. Root ran actual native git apply --check and git apply against a private original26-file copy; both exited0. The result is exactly the expected31-file source set,278806 bytes, without extras. [Final audit](final-audit-r1/receipt.json),6503 bytes, SHA25679ede0cea8ba39a9c6aa1ca789f4a2f3e496e468989abcd8e872c21fb3c8b6b5, records the commands and object construction.

The accepted author manifest is [candidate-r2-source-pins.json](candidate-r2-source-pins.json),24542 bytes, SHA2560a9c93ee5792d3df8394e31969a35a7716d971a7d4748eb81b486e5aef4cfde4. R1 remains separately preserved. R1 to R2 changes only two authored test TypeScript files and their four emitted JS/map files. Runtime, declarations, guide and original producer are unchanged.

Author packet: household-reallocation-author-r1.tar.gz,573029 bytes,289 members, SHA2561dd3c56d4e37b45c384f8504acc84ffe6f737f698501b73e976826d362ee4056, native Git blob aeb5bc4aed7c75673dca30c862c9a3e1892d0175. It is held separately by the production owner and is not silently merged into this root packet.

## Native builds and dependency provenance

Native tools were Node22.22.1, TypeScript5.9.3, MCP SDK1.32.1 and Node types24.19.1. The97 locked package versions matched. No dependency download or new tool installation occurred.

The original producer compiled successfully in7.705499 seconds at23:29 UTC on October8 and emitted66 pinned artifacts. [Original admission](original-r1-admission-receipt.json), SHA25683816969ec04ed060f03fced766b9e2d00b90bb25c9cee9f2b92646555c7e107, preserves the actual build receipt.

Root independently compiled final candidate R2 at00:04:51–00:05:04 UTC in13.582504 seconds. Compiler2964294 exited0, all109 author files reproduced, and runtime/guide/original bytes remained exact. [R2 build receipt](candidate-r2-independent-build-receipt.json), SHA25603c3a0ec7bf62565df610cadb9dda2a32fa2584a3a452a397bd4c02fd258acee, retains that result.

**Historical dependency limit.** The earlier dependency-source-pins.json inventory, SHA256fc989762b3363bf781a61c689f5c97dbeebaea59a56b8f2311c5cc926a957d71, pins2960 selected regular files. It is not a complete installed dependency inventory. Subsequent installed-command work discovered938 omitted regular files totaling3486806 bytes, plus three bin links. Earlier builds used the actual full donor, so those observed executions and output hashes remain valid. This later discovery does not retroactively establish the omitted bytes at those earlier execution times.

Root captured the complete donor independently at00:39 UTC:3898 regular files,43536531 bytes, and links .bin/node-which, .bin/tsc and .bin/tsserver. Every previously selected file still matched. [Full dependency manifest](dependency-full-source-pins-r1.json),673751 bytes, SHA2565274e4b46eca7c11a4c894d7963f888852159c9276ec4a5c9a6ef4a02f7acd47, explicitly records that historical limit.

To close the material provenance gap for the final accepted artifact, root performed one fresh compile of the final31 source files with all3898 regular files and all three link targets checked before and after. Compiler3077157 exited0 in3.877575 seconds at00:40:30 UTC. All109 resulting source/output files exactly reproduce the final author manifest. Node heap was bounded to256MiB, nice10; recorded available memory was2306314240 bytes and free disk522014720 bytes. No settled behavior matrix was repeated for this inventory correction.

[Final full-dependency build receipt](candidate-r3-full-dependency-build-receipt.json),1396 bytes, SHA256f0ab2e79d363be833898ad8d8ed717b22780143be973bffcf58a1c9bfa58b13e, records the precise argv, guard, output identity and child closure. The final custody audit also enumerated the actual complete donor set and checked every byte/link again. The dependency bytes themselves remain in the existing native donor; this archive carries the inventories and receipts rather than an unannounced copy of external node_modules.

## Original producer oracle

[original-native-r1.mjs](original-native-r1.mjs),14216 bytes, SHA256b78da7f56304c51ac1b26327aa151961696140853cc6278be9cae1967c10901b, exercised the real unchanged MCP server and LedgerStore in a private synthetic fixture. Eight groups and37 actual MCP tool calls passed:

1. Literal native get/preview and the manually expected applied pair.
2. Current pair already matching the review's after-values, with byte/mtime preservation.
3. Restoring the before-values through actual set_budget calls, then reapplying the old token. This demonstrates that the digest is not durable request history.
4. A selected-pair update through an independent SDK writer, followed by stale-review refusal.
5. Preservation of an unrelated actual native update.
6. Eleven invalid previews and three altered reviews, with exact ledger bytes/mtime after refusal.
7. A genuine upstream POST result observed after native persistence, followed by deliberate downstream acknowledgement loss; one actual commit only, followed by independent current-budget inspection.
8. A real native server restart and already_matching with exact byte/mtime preservation.

Wrapper2844659 was observed exit0, runtime5.10 seconds. Both owned servers were deliberately closed with SIGTERM and absent. The GET stream closed once with no proxy error. All26 original sources and66 compiler outputs remained exact. [Original receipt](original-native-r1/receipt.json),187846 bytes, SHA2562040cf4e8b2cacc92efd3fa60283ae7ad48dbf6bb5954e9fb43091ff41e41ea5, retains raw native responses and ledger witnesses.

## Terminal receiving and actual outcomes

The CLI requires actual stdin/stdout TTYs and an explicit numeric-loopback HTTP /mcp endpoint. The user selects existing literal categories, sees the full endpoint and all review fields, and must type exact REALLOCATE. A session sends at most one commit attempt. Cancellation, malformed input, unavailable choices and local endpoint refusals do not commit.

Root used real PTYs. Ctrl-C was the actual0x03 input byte delivered to the child after verifying its controlling terminal and foreground process group. EOF was actual PTY input. Separate native processes changed budgets through the unchanged LedgerStore/setBudget implementation. The proxy streamed long-lived GET responses and buffered only POST results.

The accepted terminal evidence is the union of four completed R1 cancellation/input journeys and the final R3 remaining cases. R1's overall observer failure remains negative; it is not relabeled as a complete pass. Those four completed journeys were not replayed because R1 and R2 runtime bytes are identical.

R3 completed12 groups with19 PTY children, a separate piped-input check, six actual commit calls and zero proxy errors:

| Case | Observed outcome |
| --- | --- |
| Explicit reviewed confirmation | Native pair changes12000/3300 to9500/5800; total and unrelated records/metadata preserved. |
| Separate-process selected change | Native stale refusal; client exits3 and says UNCONFIRMED; no extra write. |
| Separate-process matching pair | already_matching, no write; terminal explicitly avoids claiming who applied it or durable request history. |
| Separate-process unrelated change | Travel6100 remains while the reviewed pair applies. |
| Real persistence followed by lost acknowledgement | Exactly one commit; client exits3, says UNCONFIRMED, performs no automatic retry and instructs current inspection before a new review. |
| Real restart after that lost acknowledgement | Current9500/5800 shown; another2500 would produce7000/8300 with a new token; user cancels and ledger stays exact. |
| Delivered preview digest altered | Refused before confirmation or commit. Original actual upstream preview retained. |
| Delivered applied review echo altered after actual persistence | Exactly one attempted commit; response classified UNCONFIRMED. |
| Seven invalid/unavailable choices | Month, currency, index, same category, fractional amount, insufficient allowance and absent month refuse without commit. |
| Three unintended endpoint forms | Host/protocol/query refusals before HTTP. |
| Actual307 redirect | Redirect not followed; private target hit counter remains0. |
| Piped REALLOCATE | Refused before connection because a real terminal is required. |

[Final terminal receipt](terminal-r3/receipt.json),171630 bytes, SHA2567451c4b5eb5ef72ae192c1f104087abddd8851bd48ba0a1f819d055298d35abc, completed00:40:47.506908 UTC. Wrapper3077076 was observed exit0; combined final compile plus receiving runtime21.27 seconds. All24 recorded R3 owned children were absent:19 CLI processes, three independent writers and two servers. The two server shutdown exits were deliberate-15; their measured startups were0.364646 and0.668850 seconds.

Root directly read the real terminal logs for confirmed apply, lost acknowledgement and restart/fresh review:
- [05-one-explicit-commit.pty.log](terminal-r3/05-one-explicit-commit.pty.log), SHA25627af83f0d9c3649a65b202506eaf5023b24200a9d7ab22b3d7d77cb5d82d4156.
- [09-real-lost-ack.pty.log](terminal-r3/09-real-lost-ack.pty.log), SHA25651379bc9e329f2df21887b03803b3122d8d662b71eb08cfc7e78161692d1df9f.
- [10-restart-fresh-review.pty.log](terminal-r3/10-restart-fresh-review.pty.log), SHA256e81815043e07012627bb55d7287ce58a5a69096530a569432259945bd16dbcbb.

The lost-acknowledgement native ledger changed from1277 bytes/SHA256a26aad9b3dbf98eb55e54b6b769f7da93b3a932b3270d978101ac72c877a89af to1276 bytes/SHA25654d885fa52e4292fee09637cd291c6f9b0db9cd2bf4ccbe73b29079fd675c6a0. The actual518-byte upstream applied response, SHA256be7d004c537df5cec995a10e9a7962c9ffeac46bf0d1ada3d9140db1269900d3, and persisted pair were verified before downstream headers were closed. This is a real commit with an intentionally lost reply, not an invented persistence result.

## Retained failures, corrections and transport limits

The archive retains the original scripts, receipts, raw logs, fixtures and corrected successors. No product gate is inferred from an API timeout or a missing process session.

- Original staging: a write_file call timed out. The orchestration wrapper incorrectly treated the returned isError value as success and launched a missing driver. Node2803467 actually exited1 with MODULE_NOT_FOUND; no fixture ran. A read-only probe proved the driver and fixture absent and the launcher closed. The source was then staged through an exact-byte create-or-verify write. [original-staging-r1-negative.json](original-staging-r1-negative.json) preserves the failure.
- Before the first actual original-oracle execution, the observer changed from a naive escaped-text match to decoding the real MCP envelope. The initial staged driver is retained as original-native-initial-stage.mjs.
- Author compile R1 had a TypeScript union-discriminant error; the type-only correction is retained in the author packet. Initial author tests were3pass/2fixture failures. The two failing fixtures used setBudget, which trims names, while expecting literal stored spaced names. R2 seeds those literal names directly; runtime and guide are unchanged. Final compile and the two affected tests passed. Earlier resource-guard refusals remain refusals.
- Terminal staging experienced transport timeouts on both verified registrations of the same host. Exact file/process reconciliation preceded further writes or launches. terminal-transport-reconciliation-r1.json and terminal-r2-staging.json retain the custody.
- Terminal R1 actually completed four PTY journeys: full-review cancellation, EOF before connection, EOF at review, and Ctrl-C at review. All four children exited2, all no-commit/byte/mtime assertions passed, zero commit calls and zero proxy errors. The observer then raised NameError because one group metadata call used unquoted Python dictionary keys in a JavaScript-like expression. Overall R1 failed, wrapper2927958 observed exit1. [R1 receipt](terminal-r1/receipt.json),31684 bytes, SHA256003751cca934b5473b91ca6f116ac15911487d4185d355e5467d0b0df996488e, remains unchanged.
- Terminal R2 corrected six metadata calls to proper keyword arguments and skipped those four settled R1 journeys. It launched the original server but reached no CLI, group or commit. The unchanged server missed the observer's7.5-second startup limit while its stdout/stderr stayed empty. The owned server3007993 was deliberately closed-15 and absent. Wrapper3007486 was later absent, but its exit was unobserved after the process session expired. [R2 receipt](terminal-r2/receipt.json),1536 bytes, SHA256355cf8105051366c3f89790fb7d06564dc9dfafd908842fe1fb3d2fc81c18f58, remains a startup-observer negative.
- R3 changed only the isolated server startup observation from7.5 to30 seconds, recording actual startup times. No product timeout, contract assertion or application source was weakened. It ran in a new directory. [terminal-receiving-r3.py](terminal-receiving-r3.py), SHA256ffb36a58b49bc1532b69eb998e1aa37c27d3232593be1fef884e65531dd813d3, includes the unchanged semantic assertions.
- An atomic run-directory admission was moved outside the scripts' finally block before execution so an accidental duplicate invocation could not overwrite an existing receipt. The earlier staged script is retained. This is evidence custody, not a product change.
- Full dependency provenance was corrected as described above. Earlier selected inventories and archives remain unchanged; the new full inventory does not retrospectively certify earlier omitted bytes.

## Product semantics and limits that receiving preserves

The review token is a content digest. It supplies no authorization, lock, approval, expiry or durable request history. already_matching means only that the current selected values equal the reviewed after-values. If another actor later restores the before-values, the old review can apply again. The CLI therefore does not save a review for automatic retry and does not interpret matching values as proof of its own prior success.

The producer reloads through Store.update and rejects changes to the reviewed pair, while preserving unrelated current records. The store has no cross-process lock. Receiving uses one server per private ledger and explicit sequential independent writers; it does not claim arbitrary simultaneous-writer safety.

The change reallocates budget allowance only. It moves no money and creates no expense/income transaction. Amounts use safe integer minor units, with explicit currency and exact stored category identity. A refused or ambiguous reply is not recast as confirmed success.

## Custody and continuation

This packet includes the original26-file executable source closure,66 original compiler outputs, complete root R1/R2/R3 candidate snapshots, all source/output manifests, original and corrected observers, all native fixture/terminal evidence, full dependency manifest, the independent patch reconstruction, and this report. The complete120/125-leaf repository trees are represented by published object metadata; files outside the26-file producer receiving closure are not falsely presented as locally materialized source.

External node_modules links are enumerated and omitted from the archive. The publication manifest records each included file's bytes, mode, SHA256 and Git blob. The seal separately records exact archive hash, native git hash-object result, successful full-member roundtrip, report hash and final audit hash. It is outside the archive to avoid a self-referential hash.

The final audit observed all43 known owned historical process IDs absent and found no product/fixture process for this namespace. Audit wrapper3176288 was actually observed exit0, runtime0.46 seconds. Historical child exits are retained in their original receipts; current absence does not invent unobserved wrapper exit codes.

Next action belongs to the existing source/aggregate owner: compose the exact additive patch onto the identified producer, using current native gates and workflow-safe custody under the continuing no-Actions direction, then perform actual installation/use in the selected existing household package. This receiving decision supplies concrete source, commands, native evidence and recoverable limits for that work.
