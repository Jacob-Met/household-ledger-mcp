# Household monthly review: qualified after-owner contribution

## Recipient and scope

For ce7/source-parent integration and estate-61749b0088e2/canonical receiving, through Household Ledger issue #3 and draft PR8.

Issue #10 adds a private offline monthly category and budget report. Exactly six new files sit beside the accepted TypeScript ledger: the projection, explicit-file CLI, two focused test modules, maintained browser receiver, and usage documentation. All existing code, server/tool registration, Store, monetary rules, dependencies, workflow and README are unchanged.

The source input is actual PR8 head `591ab6f5a2d65bf596aeb707dbb635ee981ec926`, tree `bf7d8bedaa3ed02665e56b021f543259b8c4a854`. Main is still README-only `c063549f5caae75a6bef764a5da703f0dccfec9f`. PR8 remains another owner's draft and has not been adopted by this contribution.

Native capture `eded6ab6f0d0df801e26735e898b6aa5b746c1aa` / tree `0a156ab9481d5c5f4cd88c671443099abf16df88` has 19 selected compiler/project files: 13 exact original inputs and six additions. Its selected parent `7d6c0e251a9824347d72b29382b78ef7399cb78b` is reproduction history, not canonical ancestry.

## Product behavior

Run the existing build, then:

    node dist/src/household-review.js \
      --ledger /absolute/path/to/ledger.json \
      --month 2026-04 --currency USD \
      --output /absolute/path/to/new-review.html

The CLI takes a bounded exact UTF-8 byte snapshot of an explicit regular file. Existing native validation and monthlySummary remain authoritative. The report shows selected category gross income/expenses, net difference, stored budgets, over-limit status, the exact source basename/bytes/SHA-256, and report generation time. It keeps integer minor units and explicit currency. Unknown freshness/completeness/authenticity, legacy unassigned budgets, and missing activity/budgets are labeled accurately.

Transaction IDs, notes and idempotency keys are excluded. Valid Unicode/category spelling is escaped and preserved. Invalid displayed Unicode, invalid data, ambiguous currency context, unsafe totals and whole-output byte overflow refuse cleanly. A completed private temporary file is flushed, linked exclusively to a new destination, and cleaned up. Existing input/output files, hard links, symbolic links, directories and late competing output are preserved.

The HTML is static and works offline without scripts or storage; it has accessible internal table scrolling and a print layout. No source ledger, MCP session, account, server, provider or deployment was touched.

## Executed qualification

- Native Mac Node 26.3.0 and existing TypeScript 5.9.3: build passed, followed by 19 focused projection/actual-CLI groups. No original 101-test suite repetition is claimed.
- The original unchanged consumer first passed existing native arithmetic but failed at the absent requested CLI. On this candidate the same consumer passed, preserving ledger bytes/inode/mtime and producing the manual April USD values: income 312500, expenses 139300, net 173200.
- Actual native Chrome 154 direct-file receiving passed six groups / 57 assertions. Four real CLI-generated reports were opened; hostile markup/Unicode remained exact inert text; 390px data stayed inside keyboard-scrollable regions; an empty selection remained explicit with JavaScript disabled. Four original screenshots were viewed.
- The browser saved an actual two-page PDF. System PDFKit independently read its text, totals, budget values and complete source hash. Both rendered PDF pages were then viewed; the original PDF and page images remain preserved.
- A separate independent worker read the exact modules/domain and passed two distinct native consumers / 14 checks: nonzero-offset byte-view isolation/detachment, and selected-currency/month overflow admission through the real CLI. Its original eight-file packet is included unchanged.

Borrowed dependencies were read only: TypeScript 5.9.3, @types/node 24.19.1, and SDK 1.32.1, with exact package hashes in the baseline receipt. No dependency installation or lockfile change occurred. The intentional untracked node_modules symlink is documented in source-freeze.json. A first seal assertion incorrectly expected entirely empty Git status; its original failure is retained. The existing successful source commit was not replayed, and no source or ignore rule changed.

## Receive the narrow delta

Use `receiving/monthly-review-source.patch` from the packet, SHA-256 `dd793b9bfbb144c5545e6b6a5d23c38175d90edfa702c58a5669af20f6339cfe`. It contains only six new paths. Its application to a private index at the exact selected source input produces the frozen native source tree. The complete source manifest and calculated full 122-leaf after-PR8 tree are in the final receiving metadata.

    git apply --check /path/to/monthly-review-source.patch
    git apply /path/to/monthly-review-source.patch
    npm run build
    node --test dist/test/monthly-review.test.js dist/test/monthly-review-cli.test.js

The full native selected-source bundle is `receiving/monthly-review-source.bundle`, SHA-256 `a72c7230840224403dd4f524af6820af8bfc44189f0c5a45998f6fe85e4e8ac3`. It is reproduction custody, not a branch to merge into canonical main. The archive preserves original source, before/after receipts, compiled execution bytes, synthetic inputs/outputs, browser/PDF artifacts and independent review. Executable evidence is inside the explicit reproduction packet, not an automatic runner added to the parent.

ce7 and the canonical receiver retain adoption. Receive this additive source through the owner-qualified parent, compose with any accepted siblings, and apply normal source/CI gates before canonical inclusion. No owner branch, main, installation or live ledger was changed. This artifact branch itself must not be merged wholesale into main. Issue #10 remains open for adoption tracking.
