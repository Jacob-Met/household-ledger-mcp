# Household comparison — source and evidence handoff

The new consumer compares two explicit months from one saved Household Ledger snapshot and writes a complete private HTML report. Start with [RECEIVING.md](RECEIVING.md), apply only [source-only.patch](source-only.patch) through the existing source owner, and use [sealed-publication.json](sealed-publication.json) for the six exact source files and package pins.

## Qualified package

[household-month-comparison-c36a60df2cc1.zip](household-month-comparison-c36a60df2cc1.zip) is **2,358,081 bytes**, SHA256 `3284cada1b71cbe4d7bd6217f86451a69796200e2f66cc378a1817fc616a3dd7`. It preserves all 287 members: source, compiled consumer, private reproduction history, original failures, author receipts, and the unchanged independent consumer and visual packets.

The guide's relative source and execution paths refer to `project/docs/receiving/month-comparison-c36a60df2cc1/` inside the ZIP. The maintained product entry after the existing build is:

```sh
node dist/src/household-compare.js --ledger /path/to/ledger.json --first 2026-08 --second 2026-09 --currency USD --out /existing/folder/NEW.html
```

The input stays unchanged. The command requires a new destination and publishes completed bytes through an exclusive hard link. Differences use exact integer arithmetic; missing budgets remain distinct from zero, and ambiguous legacy input refuses.

Native strict compilation and focused receiving passed. Independent receiving passed 11 comparison cases and 15 actual CLI cases. Actual LA7 Chrome receiving passed seven groups and 55 assertions; seven screenshots and the actual two-page PDF were inspected, with 12 PDF checks. Original failures and the minor print/header presentation notes remain in the packet. These results do not claim the complete inherited service or an unrun hosted gate.

## Native custody and owner boundary

The archive and nine sidecars are verified on LA7 at `C:\Users\minec\hamon\stage\household-comparison-c36a60df2cc1`. The 4,331-byte `LA7-CUSTODY.json`, recorded at 2026-10-08T20:30:50.9366659Z, has SHA256 `130647cec6cdba6239cea2661afcb672847f9609a7cf9c70b4359787510bc975`.

Source `571ac097c34c1c041ac298ad7d20e60379980db4` adds exactly six paths over the qualified PR8 input `591ab6f5a2d65bf596aeb707dbb635ee981ec926`. The complete calculated tree `2cd593819c919a01e7dd01a4e998eb101abfc0b5` preserves all 116 parent leaves and has 122 leaves.

`estate-ce7eb129730f` retains source-parent integration and `estate-61749b0088e2` retains canonical receiving. [The source scope and owner route](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6067214316) remains authoritative. This documentation-only artifact branch has the ordinary README-only canonical parent; it must not be merged as executable-source adoption.

## No GitHub Actions

The [19:32 UTC no-Actions instruction](https://github.com/Jacob-Met/hamon/issues/143#issuecomment-6067592767) is preserved. Current default source contains only README.md; this branch adds only documentation/receiving paths and no workflow. No pull request, merge, workflow dispatch, rerun, schedule, or workflow modification is made. The known PR8 CI triggers concern main pushes and main-targeted PRs, neither of which is used. The connector rejected workflow-registry enumeration, so no registry-count claim is made.

[PUBLICATION.json](PUBLICATION.json) binds the source, archive, native custody, independent preservation and trigger inspection. Owner source adoption, installation and any later required gates remain separate.
