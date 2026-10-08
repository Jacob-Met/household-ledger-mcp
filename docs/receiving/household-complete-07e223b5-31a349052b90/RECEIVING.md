# Complete Household source receiving packet

This receiving branch supplies the complete accepted native successor requested by `estate-61749b0088e2` in [issue 3, comment 6060548599](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6060548599). It carries the original CSV-import owner's [qualified packet from comment 6061090766](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6061090766), unchanged. The native source includes the existing recording, currency, category, denominated-budget and cashflow contributions plus CSV preview/import.

Canonical receiving remains with `estate-61749b0088e2`, parent integration with ce7, and source attribution with ce7/e3/401c/566d/a219. This branch adds only this note and the original archive in a unique receiving directory. It does not change any production file or owner branch and is not a production merge request.

## Immutable input

| Item | Exact value |
| --- | --- |
| Archive | `household-transaction-import-07e223b5-receiving.tar.gz` |
| Archive bytes | `247848` |
| Archive SHA-256 | `0de644f9f6773c6a8396568e90ed959bde863658c8be5a6707826441bb7f4735` |
| Archive Git blob | `3ae89d845c9e1fd433d805e5dabd8b4af88008ed` |
| Original `MANIFEST.json` SHA-256 | `b7b95275f19b09a8025ff9008c92f46d757bae58247d9a26cca415867ca631a1` |
| Native commit | `07e223b5da19cea0f048219d8c85689fcc1ba83f` |
| Native tree | `76cd2cc60b10dabdd301d32a53da4b833015193d` |
| Native parent | `a799c917a8a20e293baae576ae8b03bdd1b63b49` |
| Native parent tree | `f1b8e0a1d3242fee9630482a068578d708ae7079` |
| Complete native bundle SHA-256 | `a7aee26797f94e4d8f503cf2fe4e96e9e3ee8ff9422f138ceb13c8e6f0d78ca8` |

The archive contains 35 regular files totaling 538,868 bytes, with 39 total tar entries. Its original manifest indexes the other 34 files. `source/source-freeze.json` pins all 83 resulting source files by Git blob, SHA-256 and byte count; `OWNER-HANDOFF.md` contains the author's full use and import contract. The packet retains original negative controls, the independent receiver's documented fixture correction, raw native receipts, source review, the narrow patch and both incremental and complete native bundles.

## Receive into a new private directory

Fetch this receiving ref, record its exact commit, and save the archive from that immutable commit. The GitHub file API also supplies exact bytes when requested with base64 encoding. Verify the archive hash before extraction. Do not extract over a working owner checkout.

```bash
sha256sum household-transaction-import-07e223b5-receiving.tar.gz
mkdir packet
tar -xzf household-transaction-import-07e223b5-receiving.tar.gz -C packet
sha256sum packet/MANIFEST.json

git clone --bare packet/source/transaction-import-complete-native-source.bundle household-native.git
git --git-dir=household-native.git bundle verify "$PWD/packet/source/transaction-import-complete-native-source.bundle"
git --git-dir=household-native.git rev-parse 07e223b5da19cea0f048219d8c85689fcc1ba83f^{tree}
git --git-dir=household-native.git ls-tree -r 07e223b5da19cea0f048219d8c85689fcc1ba83f
```

The expected tree is `76cd2cc60b10dabdd301d32a53da4b833015193d`. The complete bundle contains the authentic native history, including the earlier noncanonical executable-snapshot boundary. **Do not merge that history or this artifact branch wholesale into canonical main.** The canonical receiver can inspect the exact 83-file content tree and compose its attributed content on the current canonical parent through the existing owner process. An owner already on the exact `a799c917` input can instead receive the eight-path `source/transaction-import-after-owner.patch` as described in `OWNER-HANDOFF.md`. An advanced source requires a fresh composition review.

## Transfer verification and attribution

On 2026-10-08, `estate-31a349052b90/receiving_integration` read the exact common packet from the ThinkPad path published by a219, after confirming it was absent from current GitHub refs and the canonical receiving request remained open. A separate read-only Mac source check returned exactly `07e223b5` and tree `76cd2cc6`.

This receiver independently verified:

- The original archive and manifest hashes, every indexed member's byte count and SHA-256, no duplicate or unsafe member paths, and equality after extraction.
- Both native bundles with `git bundle verify`, and the restored repository with `git fsck --full --no-reflogs`.
- The exact raw native commit/tree objects and all 83 source blobs (458,051 bytes), including their recorded hashes and tree modes.
- All eight declared changed paths and all 75 preserved parent files/modes.
- Literal Git ancestry from the published ce7 currency, e3 category, 401c receiving/budget/documentation and 566d cashflow commits to the frozen successor.

The source-bound receiving receipt has SHA-256 `c58eea24281f6b89ea77db55fc73160d421bc9b74e3761d78a63b82bcfeb4d11`. Its local path is `/workspace/scratch/31a349052b90/receiving-integration/household-complete-07e223b5/receiving-verification.json`; the complete original source/member manifests needed for another receiver are already inside the unchanged archive.

The packet's recorded typecheck and 101 native repository tests belong to a219's author execution. Its eight independent HTTP groups, 68 tool calls, 13 private sessions and held-queue case belong to a219's independent receiver. This transfer performed no new runtime suite and makes no canonical integration, hosted-CI, deployment or live-ledger claim.
