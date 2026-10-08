# Qualified transaction filters: owner receiving

The contribution for [issue #6](https://github.com/Jacob-Met/household-ledger-mcp/issues/6) is implemented and independently received on the accepted native source. Continue adoption through the existing [issue #3 owner route](https://github.com/Jacob-Met/household-ledger-mcp/issues/3).

## Exact inputs and output

| Role | Commit | Tree |
| --- | --- | --- |
| Accepted native parent | `07e223b5da19cea0f048219d8c85689fcc1ba83f` | `76cd2cc60b10dabdd301d32a53da4b833015193d` |
| Qualified source, tests and guide | `f3aa61a5576c3cffb4c6762d5ef8aa970ec86634` | `e69cd3751afae62e293a44f6300ed882fe2aa187` |
| Source plus author evidence | `836dd14f5b1d3a0b32e9fbb5e3d22b63913ab279` | `ad58412f8979f84fed1b88f8f4b03e09a27b1dd0` |

The source contribution changes six paths: the filter interface/function in `src/ledger.ts`, the existing `list_transactions` tool description/schema in `src/index.ts`, two new tests, a user guide and a concise README addition. It preserves all 80 other accepted parent files. Author evidence adds 31 uniquely prefixed paths; the complete native result contains 117 files.

The [author owner packet](household-transaction-filters-owner-packet.tar.gz) contains the two-commit after-parent patch, incremental bundle, complete native reproduction bundle, full source manifest, qualification and original owner instructions. It is **307,871 bytes**, SHA-256 `ac5e9acc02860001ee2784b0aef481dc4dfd831f78452fed7f2fa05994d58421`, Git blob `0e44f295b0e326811d07df165e7dc766611fc2c4`. All eight regular archive members, totaling 580,574 bytes, were read and checked; the seven non-self members match PACKET-MANIFEST.json. All 37 changed committed paths match their declared bytes, modes, SHA-256 and Git blob identities.

The [independent review](../../evidence/transaction-filters-18a24bf0c281/independent-mcp-runtime/REVIEW.md) and its 11 accompanying files are separate, additive evidence. They are published at their exact original paths under `docs/evidence/transaction-filters-18a24bf0c281/independent-mcp-runtime`. The original author packet's pending-independent wording remains an accurate historical record; this separate review supplies the completed acceptance.

## Behavior and qualification

Optional currency and literal category/note text selectors combine with the existing filters before total, ordering and pagination. Text comparison uses NFC and Unicode lowercasing, searches category and note separately, treats punctuation literally and excludes hidden record fields. The response returns the original records. Listing performs no ledger write or currency conversion.

| Receiving | Preserved original | Exact candidate |
| --- | --- | --- |
| Author's unchanged actual-HTTP driver | 4/17 checks | 17/17 checks |
| Author's six domain methods | 1/6 | 6/6 |
| Author's focused native suite | Original controls retained | 22/22 methods, no skips or cancellations |
| Independent actual-MCP receiver | 2/14 cases; 75/98 checks | 14/14 cases; 98/98 checks |

The independent 22-row, three-currency corpus has two budgets and deliberately interleaved matches. Its handwritten expectations distinguish predicates before counting/paging, zero and exhausted pages, NFC text, Japanese text, literal punctuation, hidden IDs/keys and separate-field matching. Every returned object remains the original. The entire 7,554-byte ledger keeps identical bytes, inode and write timestamps through all reads and shutdown on both versions.

The independent receiver uses the maintained HTTP entry and real MCP SDK transport with Node v26.3.0 and TypeScript 5.9.3 on native macOS. It executes no author test method, recording/import tool or live-ledger operation. Author receiving separately exercises the existing CSV preview/commit path and exact recording retry. These are bounded receiving counts, not a claim that the entire advanced repository suite was rerun.

## Receive through the existing owner

1. Verify the archive identity and member manifest before using its contents.
2. On an isolated source checkout at exact native parent `07e223b5`, receive the narrow after-owner patch or incremental bundle and verify the resulting 117-file manifest. The complete native bundle is available for isolated reproduction.
3. Retain the 12 independent evidence files verbatim with the contribution.
4. If the receiving source has advanced, review and qualify that composition first. In particular, [issue #5's budget-copy contribution](https://github.com/Jacob-Met/household-ledger-mcp/issues/5) is a separate qualified sibling after the same parent. Its new module/tool and roster spans retain their owner. This packet does not claim that the two sibling contributions have already been composed.

ce7 retains source-parent integration and estate-61749b0088e2 retains canonical receiving. The previous complete parent packet remains available at artifact commit `d821d8ce749d22568514efb4eb4dd25e5cdfbf06`.

This receiving branch has the ordinary canonical parent `c063549f5caae75a6bef764a5da703f0dccfec9f` and preserves its README bytes. It contains custody artifacts and review evidence. The inherited native snapshot ancestry and this artifact branch must not be merged wholesale into canonical main. No production-source PR, main adoption, deployment, installed service or live ledger change is claimed.

Native author custody: `/Users/me/household-transaction-filters-18a24bf0c281`. Independent custody: `/Users/me/household-filter-independent-18a24bf0c281-runtime`, evidence commit `0c5892189db34abc44cbac8c84642f28000c36d0`, on Mac `0e3d582f-e25b-44b2-8418-9639fc4e4e33`. [Root integrity record](root-integrity.json) records exact packet and publication scope.
