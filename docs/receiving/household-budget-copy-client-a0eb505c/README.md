# Reviewed budget-copy terminal client — owner receiving

This additive client lets a household member inspect every monthly-budget copy row and current destination, then explicitly confirm once or cancel. This artifact is for estate-ce7eb129730f source-parent disposition and estate-61749b0088e2 canonical receiving under [issue3's active composition route](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6064760587). It preserves that route and does not claim PR8 integration, an installed client, canonical adoption or deployment.

- Native source: **c92fc2300710b566b90379b384dd445c7dd163d4**, tree **ed89ea32fbbae94824faa98005f2cce4df61d052**.
- Accepted budget-copy parent: 2b77b81ad59c5f3255aa25c37110e91d3bad6a01.
- [Complete source/evidence archive](household-budget-copy-client-c92fc230-receiving.zip): **991,780 bytes**, SHA-256 **e4e322b758d6b800c98e638cd2e14b184c6b52f526b50f98c5c7cbaece090973**.
- [Cumulative six-addition source patch](source.patch): **46,998 bytes**, SHA-256 **523a2f7cfe3377e931a0510550a8bf7f9f1390e358a8779e7af1c9196d9db5e1**.
- Archive manifest SHA-256: efe5fc05a7ed51f42b8f0016d2e018d09ed5f68b1d5c161525c566e0c89246a7; every one of its **284 members** was reopened and verified after compression.

## Narrow source scope

The six additions are:

- src/budget-copy-client.ts
- src/household-budget-copy.ts
- test/budget-copy-client.test.ts
- test/budget-copy-client-http.test.ts
- docs/BUDGET_COPY_CLIENT.md
- examples/budget-copy-request.json

All 97 inherited files remain exact. The packet contains all 103 Git source files and all 78 executed compiled files, the narrow patch, authored patch series and incremental native reproduction bundle. Applying the cumulative patch to a private 2b77 index reproduces exact ed89.

Receive only this delta through the owners' accepted source after its budget-copy contract is present. The native snapshot ancestry and this inert artifact branch must not be merged wholesale into canonical main. The existing ledger, Store, server, stdio, package metadata, lockfile and tool catalogue are unchanged.

## Qualified user flow

The client uses the existing SDK HTTP /mcp server at an explicit loopback endpoint; it opens no ledger and starts no server. It validates the complete preview and token, renders every selected category and current destination using exact integer minor units, and visibly escapes Unicode control/format characters while preserving their exact identity. Interactive mutation requires an input/output terminal. Only exact COPY followed by the destination month and normalized currency makes one commit call; another answer, EOF or Ctrl-C cancels. --preview is read-only and --help is offline.

A lost or malformed commit result is explicitly **unconfirmed**; no commit retry or automatic re-preview occurs. The existing server's current-value checks and lack of durable plan-history receipts are retained.

Historical 40f passed 13 focused author groups. Final c92 passed the changed Unicode control and one real changed-runtime lost-response case. Independent actual PTY receiving passed **4 branches /89 assertions**: cancellation paths made zero commit calls with exact ledger bytes/inode/mtime; exact normalized confirmation plus a buffered duplicate made one commit; all 3 original rows and exact 12345/6700/0 amounts appeared before input. The unchanged 118 domain controls were not rerun.

Independent review SHA-256: d1c5a8ea18ff3baa27c164b919b34a4692832f9c6a48cedb3ba88c0fe610c672. Root source-review SHA-256: 5ee356ec67f956036c579ca7cce84c23cd9324f67956c6d3a8a646c8528b6b3e. Both originals, all actual receiving inputs/outputs, and setup/product negatives are retained inside the archive.

## Runtime and adoption limits

Final receiving used Node 22.22.1, SDK 1.32.1 and TypeScript 5.9.3 with 3,890 dependency-file hashes captured before use. Relative to the committed lock, actual @hono/node-server is 2.1.4 rather than 2.1.3, @types/node is 22.19.15 rather than 24.19.1, and undici-types is 7.18.2 rather than 7.24.6. The latter two are declaration differences. The final packet explicitly includes the immutable freeze and its comparator-correction addendum; the original empty difference list is not an equality claim. Historical 40f did not capture every transitive byte, so equivalence is not asserted. Third-party package bytes are not redistributed.

This is qualified native source/receiving evidence on that exact runtime, not hosted locked-runtime or canonical integration evidence. No live household data, shared server, provider, account or production service was used. The complete guide inside the archive distinguishes each historical result and limitation.
