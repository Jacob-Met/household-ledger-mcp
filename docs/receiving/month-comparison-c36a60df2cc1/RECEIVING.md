# Household two-month comparison — owner receiving

This additive consumer reads one explicit saved ledger, compares two distinct caller-selected months in one currency, and creates a private, self-contained HTML report. Changes are second minus first. Exact minor-unit deltas use decimal strings; complete category and budget unions preserve raw names, absent versus zero budgets, and admitted legacy context.

After the existing project build:

```sh
node dist/src/household-compare.js --ledger /path/to/ledger.json --first 2026-08 --second 2026-09 --currency USD --out /existing/folder/NEW.html
```

All five options are required. The output parent must exist and the destination must be new. The retained compiled entry is `docs/receiving/month-comparison-c36a60df2cc1/compiled-r2/dist/src/household-compare.js`; it accepts the same arguments. `docs/MONTH_COMPARISON.md` defines the operator contract. Inputs remain untouched; missing or ambiguous input is refused. Publication requires filesystem hard-link support, with no overwrite fallback.

## Source and integration route

Required producer: draft PR8 at `591ab6f5a2d65bf596aeb707dbb635ee981ec926`; unchanged ledger blob `2ff8133404f19c705eb7b7f0a943e8190f3328d6`. Final native source: `571ac097c34c1c041ac298ad7d20e60379980db4`.

The six additions are:

- `src/month-comparison.ts`
- `src/household-compare.ts`
- `test/month-comparison.test.ts`
- `test/month-comparison-cli.test.ts`
- `tools/check-month-comparison.mjs`
- `docs/MONTH_COMPARISON.md`

`source-only.patch` is **65,141 bytes**, SHA256 `48dfdc1fc2d0ffa921d089f29a596cbf2a273a11fef42c73b036f7551fe6b39f`. `source-publication.json` pins every added file. The coordinating receiver's canonical source gate preserves all **116 existing parent leaves** and adds exactly these six previously absent paths. This is distinct from native qualification of the smaller dependency projection.

Follow the prior monthly-report convention: publish an inert source/evidence artifact branch from README-only canonical parent `c063549f5caae75a6bef764a5da703f0dccfec9f`. `estate-ce7eb129730f` retains source-parent integration; `estate-61749b0088e2` retains canonical receiving and sibling composition. Apply the narrow delta through that route after checking the actual accepted producer. Do not merge the artifact branch, native projection ancestry, or PR8 on this contribution's authority. Existing cashflow, budgets, filters, import/export and single-month report scopes remain unchanged.

Scope record: https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6067214316.

## Evidence and qualification

Native receiving used Node 22.22.1, TypeScript 5.9.3 and locked Node types 24.19.1. The original frozen consumer passed **2/3**: producer/input controls passed and the new CLI was absent. The unchanged consumer passed **3/3** on the candidate.

Generation r1 passed strict compilation and **21 focused tests**: 14 domain/render and seven CLI. A later real prefix-write interruption exposed a **19-byte partial final report**. That negative source, output and receipt are retained. The final writer completes, syncs and closes an exclusive 0600 owned stage, publishes by exclusive hard link, then removes only its stage. The same interruption now leaves no final report. Generation r2 passed strict compilation, **8/8 targeted CLI tests**, and the unchanged **3/3 consumer**. The exact pure module stayed unchanged, so its 14 cases were not repeated.

Independent receiving froze nine fixtures before candidate inspection, preserving the unchanged producer and setup failures. It passed **11/11 comparison cases** and **15/15 actual CLI cases**, including odd wide deltas ±18014398509481981, whole-snapshot admission, legacy ambiguity, immutable input, 0600 output under umask 000, destination refusal, and two competing processes yielding one complete report. The 109-file packet manifest is SHA256 `756dfdd7b78b4f17351b1c4dd6504d4c279cc39df99e260b12a11163caddc7bf`; no author suite was rerun.

Actual LA7 Chrome 154.0.8037.98 opened the exact final-CLI HTML through file: URLs: **7 groups / 55 assertions passed**, including literal values, keyboard scrolling at 390px, accessibility structure, legacy/zero budgets and the JavaScript-disabled empty report. All seven screenshots and both tagged PDF pages were visually inspected; **12 PDF text/custody checks passed**. Browser receipt SHA256 `375f92453587edc3966ab1870e3b87dd5c45fdc58e7bd7c7a8e7f54155253ad8`; final inspection record `42cdc4ad7f42b610c66dcfbb16f81286acab46f26542c2a11530dd00e495e892`. A4 headers sometimes wrap within words and a single-category caption says '1 categories'; labels and values remain readable. Earlier ThinkPad readiness/startup failures remain retained, with no passing HTTP-delivery claim.

These receipts qualify the stated source and fictional consumers, not the complete inherited service suite, Node 20 hosted gate, installation, account activity or owner adoption. Recheck relevant dependency drift; preserve archived evidence and use fresh destinations for any newly required receiving.
