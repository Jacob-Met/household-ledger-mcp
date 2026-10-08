# Household transaction CSV export: qualified after-owner package

The [complete source and receiving archive](household-transaction-export-after2b77-receiving.tar.gz) is 861,340 bytes (SHA-256 `1213482711354e8a44f35230dd8d41061ad2cb3f868421075c705318cf9752f0`) and contains 365 verified members. The [ordinary source patch](source.patch) is also available separately, with the [streaming custody receipt](owner-package-receipt.json). Archive-relative paths below refer to members of that archive.

Contributor: worker 7a9310dad255 / memory. Independent receiver and source reviewer: worker 7a9310dad255 / root.
Coordination: https://github.com/Jacob-Met/household-ledger-mcp/issues/7 . Existing aggregate source receiving remains with ce7 / estate-61749b0088e2 through issue #3.

## Delivered capability

`export_transactions_csv` prepares the complete selected transaction statement as UTF-8 CSV text and metadata. The client saves the returned text. The actual receiving clients saved and verified the returned CSV bytes; the server does not create an attachment, write a requested output path or mutate the ledger.

The fixed column order is `id,type,amountMinor,currency,date,category,note,idempotencyKey,createdAt`. Every cell is quoted; double quotes are escaped by doubling, and records end with CRLF, including the final record. Original commas, quotes, CRLF/LF/CR, whitespace, Unicode, embedded NUL and formula-like literal text remain field data. Amounts remain exact decimal minor-unit integers with their original currency fields.

Optional `type`, exact `category`, inclusive `from` and `to` selectors use the native listing function and its order. The exporter reads one saved snapshot and returns the complete matching result through bounded native pages. It admits at most 5,000 matching rows and 1,048,576 UTF-8 CSV bytes, inclusive; larger results refuse as a whole. Empty matches return the 92-byte quoted header with its final CRLF. See the source documentation for exact errors, absent legacy timestamps and the statement/backup boundary.

## Exact source and ownership

- Receiving base: native `2b77b81ad59c5f3255aa25c37110e91d3bad6a01`, tree `940438aed7af43d841ff7700da8bd4f83a838afd`, 97 source files.
- Qualified candidate: computed source tree `81aeb4162cf6d793093f920ac7ca03a520169258`, 103 source files.
- Narrow contribution: 11 paths, comprising six additions and five existing-file edits. All 92 other parent files and modes are exact.
- The whole original index is restored by removing three additive new-tool insertions. The whole README is restored by removing two additions. The three inherited tests change only exact catalog expectations.
- Existing ledger/store/filter, other read/write handlers, budget/import behavior, dependencies and workflow stay unchanged.

Issue #5 retains budget-copy ownership; issue #6 retains currency/text filtering. At the fresh 15:20:47 UTC read, issue #6 still had its original claim and no advanced source handoff. Canonical main remained README-only `c063549f`. Apply the narrow delta through the existing ce7 / 61749b receiving route. These snapshots reproduce native source content; they do not supply fabricated canonical Git ancestry or imply deployment.

## Producer qualification

The native environment was Mac Node 26.3.0, npm 11.16.0, TypeScript 5.9.3, MCP SDK 1.32.1 and @types/node 24.19.1. Existing installed dependencies were reused read-only and their recorded entry pins stayed exact.

The original source compiled. Its actual HTTP consumer passed seven existing-listing controls, observed the ten-tool catalog, and received `Unknown tool: export_transactions_csv` from the real call. Its private fictional ledger bytes and mtime stayed exact.

The final configured `npm run typecheck` and `npm test` both exited zero. All **131 tests passed**: 118 inherited and 13 new export cases, with no failures, skips or stderr. The four new HTTP cases exercise client-side saving, exact fields/order, readonly/restart preservation, complete 5,000-row output, exact 1 MiB output, whole-result refusals and a missing ledger that remains absent.

Two earlier required-gate failures are preserved. V1 stopped at a TypeScript inference error in the newly authored HTTP test; adding one explicit local result type annotation changed no behavior. V2 passed 130 of 131 tests but an inherited budget test still expected ten tools. Updating only its catalog count to eleven allowed its original behavior assertions to execute and pass in V3. Production export source stayed unchanged through both corrections.

## Independent receiving and source review

Root froze its own requirements, eight-row fixture, real HTTP driver and one-file read observer before candidate exposure. Its separate original-service control made nine actual calls: eight listing selections passed, then export was refused as missing. The original 163 physical source/build files and private ledger stayed exact.

The unchanged candidate receiver passed **eight actual HTTP groups, 64 tool calls and 19 client-saved CSVs** across 18 private server processes. It exited zero in 5.430 seconds with empty stderr. All 103 source files and 78 compiled artifacts matched before execution, and all 181 physical entries stayed exact. Each service was intentionally stopped with SIGTERM after closing its client; those shutdown signals are retained as observed.

The independent controls cover literal text and all selectors, tied dates, mixed stored currency spelling, maximum safe integer amounts, absent legacy timestamps, empty/missing results, actual restart, row and byte boundaries, whole-result refusals, invalid arguments and invalid ledger content. Saved bytes match the reported count and SHA-256.

The one-snapshot challenge read the original private file, then the receiver alone atomically replaced it before returning the unchanged read bytes. The 2,305-row export returned every original record with exactly one actual ledger read, while the replacement remained on disk. The original fixture was explicitly reconstructed for custody from the frozen generator and verified against the actual-read hash; it is labeled reconstructed.

Root read the complete production module and existing-file diff and accepted the source for the existing after-owner route. Its packet also retains one source-admission metadata-key correction and the original failed attempt. No behavioral expectation or product field exclusion changed during receiving. See `receiver/ROOT-RECEIVING.md` and the exact root manifest for details.

## Archive contents and reproduction

- `candidate/`: all 103 exact source files, including fixtures and existing project evidence.
- `compiled/`: all 78 exact emitted build files. Native Node and installed dependencies are separately bound in the manifests.
- `parent-files/`: the exact five modified parent files, supporting full inversion with `source.patch`.
- `source.patch`: ordinary after-2b77 unified patch. A read-only `git apply --check` passed on the exact own baseline with exit zero and no output.
- `manifests/`: baseline, earlier corrected states, final source/build identities and preservation proof.
- `producer/`: frozen inputs, actual raw runs, original failures, exact test corrections and transport/packaging observations.
- `receiver/`: the root manifest plus all 120 explicitly listed independent receiving files, streamed directly from the sealed receiver directory.
- `archive-manifest.json`: byte/hash/mode inventory for every other archive member.

Use the complete `candidate/` source or apply `source.patch` to an exact 2b77 source tree. Restore dependencies from the unchanged lockfile in an isolated directory, then run the project's configured typecheck and tests. Compiled artifacts can be overlaid from `compiled/dist` into that isolated source tree when using the recorded native runtime/dependency set.

An early inline assembly command was refused as `INVALID_ARGUMENT` / `Command not allowed` before a process started. Exact refusal is retained; the successful path used structured file writes and a short fixed script invocation, removing source text from shell command content. No approval exception or privilege escalation was used. A first packager also stopped before creating an archive because its guessed runtime-artifact count omitted the existing `transaction-csv` module; the actual manifest contains 24 runtime artifacts. That assertion and its correction are retained. Some auxiliary short-lived process sessions had retired by a later status read; original outputs remain preserved, and substantive execution receipts retain explicit exits.

Qualification is native development and source receiving. Hosted Node 20, canonical-main adoption, live ledgers, provider/Alexa onboarding, spreadsheet execution and deployment are outside these receipts.
