# Installed saved-ledger CSV delivery

The installed Household command now turns an explicit saved ledger JSON file into a complete new physical CSV statement. Independent receiving invoked the actual installed entry from `/tmp`, created the exact 976-byte statement from the original 2,405-byte fictional ledger, then invoked it again and observed the required existing-output refusal. All three frozen receiving groups passed.

## Use the installed command

```sh
/Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7/household-snapshot-csv \
  --ledger /absolute/path/to/saved-ledger.json \
  --output /absolute/path/to/new-statement.csv
```

The input and output parent directory must already exist. Choose a new output filename. Optional selectors are `--type income|expense`, `--category TEXT`, `--from YYYY-MM-DD` and `--to YYYY-MM-DD`. The installed helper retains the qualified validator, matching rules, row ordering and literal CSV values. See the complete [operator and recovery guide](../../../tools/snapshot-csv/README.md).

The delivery is installed at `/Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7` on Mac.lan, using the existing resolved Node v26.3.0 runtime at `/opt/homebrew/Cellar/node/26.3.0/bin/node`. Its 19 files occupy 963,062 bytes. The final [installation marker](native/installed/INSTALLATION.json) is Git blob `72ad7f6866e200910664bfc4cf385abe59b05c61`. The actual rendered executable is retained at [native/installed/household-snapshot-csv](native/installed/household-snapshot-csv).

The operation reads one explicit regular saved file through a read-only descriptor, validates the whole captured ledger, and calls the unchanged CSV function. It writes and syncs a private sibling before publishing a complete final file through an exclusive hard link. Existing output paths are refused. No service, SDK, provider, package-bin registration, dependency installation or live Store is involved.

## Exact source authority and preserved owners

The sole Git parent for this additive custody candidate is `aac08aa93db2872aa1ff69e6bbd3844f0dfde015`, tree `5a8131489011a42ac483b5b515cd29f8304919ea`. All five parent leaves remain byte-for-byte and mode-for-mode unchanged. That parent already retains the original qualified compressed archive, Git blob `53c0af2d577119337f3a06ab956373814ffc341d`, 861,340 bytes, SHA256 `1213482711354e8a44f35230dd8d41061ad2cb3f868421075c705318cf9752f0`.

The archive identifies native source content tree `81aeb4162cf6d793093f920ac7ca03a520169258` and native source parent `2b77b81ad59c5f3255aa25c37110e91d3bad6a01`. This Git artifact ancestry does not assert canonical adoption of that native source.

There are eight new source paths under `tools/snapshot-csv/`: six authored consumer/installer/guide/metadata files and two exact unchanged emitted original modules:

| Module | Bytes | Git blob | SHA256 |
| --- | ---: | --- | --- |
| lib/ledger.js | 15,698 | `003fe1cb4fbca02d9dc127804e7f31284192a197` | `8e80c26b8f68767f80d87bc79a41ff0711f5996dffe5652ef859c4ecef3ac48a` |
| lib/transaction-export.js | 5,301 | `ecf572a57c648ea2e74a1f2ee842503355581406` | `9995fb6b3a2e5797cc506b55b2db8a53d4858a033629faeb9452416c7eda15d2` |

[INPUTS.json](../../../tools/snapshot-csv/INPUTS.json), [SOURCE-AUTHORITY.json](SOURCE-AUTHORITY.json), the retained original archive and original-only capsule preserve the complete selected source and version provenance. Existing 99cea MCP statement-client/server/export/package work and ce7/61749 aggregate adoption remain with their owners. The bounded readable handoffs and the exact unreadable advisory boundary are recorded; no complete native code-claims coverage is asserted.

- [Original export offer](https://github.com/Jacob-Met/household-ledger-mcp/issues/7#issuecomment-6064040050)
- [Original independent receiving](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6063996302)
- [This distinct saved-file command reservation](https://github.com/Jacob-Met/household-ledger-mcp/issues/7#issuecomment-6075561537)

## Actual author execution

The original exporter qualification was reused. Its old matrix was not rerun. Private CLI drafting preceded the independent contract; the exact contract was retained before source exposure and author execution, with that chronology explicitly disclosed.

The [original author receipt](native/author/author-install-and-refusals-v1.json), Git `343a733eae520fb3c28658d4138bbc8b78c10c14`, preserves every call and result:

| Author operation | Actual child | Exit | Result |
| --- | ---: | ---: | --- |
| New exclusive installation | 68760 | 0 | 19-file installation completed; marker written last |
| Installed command with invalid JSON | 68775 | 2 | Exact malformed input retained; no CSV or stage residue |
| Installer against the existing destination | 68793 | 1 | Refused; existing installation preserved |

The controller 68728 exited 0. Source preparation separately recorded Python/Node/shell syntax checks. The actual expected refusals, their original diagnostics and the malformed two-byte input remain in custody; they have not been replaced by success summaries. The author did not run the ordinary successful export before independent receiving.

## Independent installed receiving

The [frozen contract](independent/CONTRACT.md), Git `2012387eec7356f3035e85fd06d370ed163a7cc3`, and the original saved ledger plus original expected CSV were fixed before new source exposure. The receiver reviewed the actual installed source, retained its own [source freeze](independent/SOURCE-FREEZE.json), and used a separate bounded directory.

| Group | Actual observation | Disposition |
| --- | --- | --- |
| F1 | At 2026-10-09 06:56:27 UTC, child 90895 invoked the absolute installed entry from `/tmp`; exit 0 in 0.086909 seconds created a new 976-byte, eight-row physical CSV and reported matching source/output identities | PASS |
| F2 | Child 90898 repeated the same invocation; exit 1 in 0.081688 seconds refused the existing output. Its bytes, mode and mtime remained unchanged, and no private stage remained | PASS |
| F3 | All 19 installed files, eight source files, 12 offered original files, runtime and author receipts retained their exact bytes, modes and mtimes. Both owned command children were absent | PASS |

The independent controller 90853 exited 0; the native tool reported 0.33 seconds overall. F1 standard error is empty. F2 contains only the expected existing-output diagnostic. A later [read-only outer closure](independent/OUTER-CLOSURE.json) confirms the controller and both children absent and all 15 original receiving files unchanged. It did not invoke the product again.

The [complete receiving receipt](independent/RECEIVING.json) is Git `5e6e924a0caa02e729f69db761187f826f77d0fa`, 14,876 bytes, SHA256 `94a1cc3818a52ee6d79d8bba7d1ea215843ea759da9ef2b66e6b6a0aae338d3b`. The [independent report](independent/README.md), raw streams, before/after manifests, frozen source and transport remain alongside it.

### The physical statement

The actual newly created file is retained at [independent/delivery/statement.csv](independent/delivery/statement.csv). Its native path is:

`/Users/me/Developer/household-snapshot-csv-receiving-c945953fdeb7/delivery/statement.csv`

It is 976 bytes, SHA256 `24113776afdf40feea50b26dfee4170ed850dd0851b8e7b6cefff7616e095be2`, Git `6cca2120e1381f89777d367b75cb9f1c868cc4cc`. That Git identity equals the original expected statement because every byte matches. The receipt separately establishes actual new file creation, path, child invocation and native metadata; the expected file was not regenerated or copied into the output.

The eight-row example is fictional. Exact literal content includes quoted fields, Unicode, embedded line breaks/NUL, original currency spelling and integer minor units. Preserve the complete bytes when consuming it. [ARTIFACT-CONTENTS.json](independent/ARTIFACT-CONTENTS.json) is a lossless UTF-8 JSON carrier of the 20 original independent evidence files, including the actual delivered CSV.

## Recovery, full custody and publication limits

The installation retains the unchanged original archive and all eight source inputs under `recovery/`. A separate new-destination recovery procedure is documented in the installed guide; that additional installation has not been executed. Existing Node is an admitted runtime dependency, not bundled or installed by this work.

[NATIVE-CUSTODY.json](NATIVE-CUSTODY.json) binds all 45 native author/install files after receiving. Its original raw JSON retains exact native integer timestamps. The Git tree preserves ordinary and executable Git modes; full native permission bits and mtimes are evidence metadata, not capabilities of Git file modes.

[COMPOSITION.json](COMPOSITION.json) declares every expected addition and the full five-leaf parent preservation proof. This candidate adds 82 leaves: eight source files; 45 native author/install files; four authority/transport/reservation records; one native custody record; 22 independent files including the complete map and carrier; this README; and the composition declaration itself. There are 87 final leaves, no changed or removed parent files, and no workflow addition.

[WORKFLOW-ADMISSION.json](WORKFLOW-ADMISSION.json) retains the observed full default/parent workflow absence, complete current PR workflow body, 27 refs and empty repository rulesets. The separate PR8 workflow was filtered to push/main and pull_request/main at observation. The worker creates only unreferenced blobs, tree and commit. Root owns the fresh final source-ref admission; no branch, PR, main, owner ref or Actions operation is performed by this composition. Unreferenced objects alone do not guarantee enduring retention.
