# Household planned-expense preview — authored receiving

This held six-file contribution lets a household compare recorded month/category/budget values with a declared list of additional expenses. The real CLI writes a new offline report and never records the hypothetical transactions or changes budget limits. Issue14 reserves the source fence.

## Exact source and invocation

Receiving parent is PR8 `591ab6f5a2d65bf596aeb707dbb635ee981ec926`, complete tree `bf7d8bedaa3ed02665e56b021f543259b8c4a854`. The six additive product/test/tool/document files produce tree `4da046012fb5b0007005204d624dc8b495e79c1c`: 122 leaves, all 116 parent leaves preserved. The native checkout is a 28-file source closure, not a complete canonical checkout. `candidate-manifest.json` pins that closure, all new files and the actual compiled ledger/model/CLI bytes.

```sh
npm run build
node dist/src/household-plan.js --ledger FILE --plan FILE --month 2026-10 --currency USD --out NEW.html
```

The guide at `docs/EXPENSE_PLAN.md` defines the plan schema, native rules, declared bounds and delivery contract. Every planned occurrence counts separately. The recorded native summary must qualify before hypothetical additions. Notes remain literal; unrepresentable HTML code points use labeled reversible JSON strings. Captured inputs are checked again by identity, write metadata and complete bytes immediately before exclusive final output delivery. This is not a cross-process writer lock.

No shared ledger/Store, existing handler/client/test, package/lock/config, README or workflow bytes changed. The product does not require a new package binary or MCP tool.

## Executed qualification

| Receiving | Observed result |
| --- | --- |
| Original private real HTTP MCP baseline | Four phases passed; recorded values stay unchanged after detached feasibility calculation |
| Existing TypeScript build of candidate | Exit0, zero diagnostics |
| Focused authored tests | 17 passed; zero failures/skips |
| Normal `npm test` | 118 passed, six suites; zero failures/skips |
| Maintained real CLI example | Eight checks passed; exact saved report and input custody |
| Source custody after gates | All28 source files and three compiled inputs unchanged; original baseline43 still exact |

Native runtime is Node22.22.1 with the existing TypeScript5.9.3, MCP SDK1.32.1 and Node declarations24.19.1. No dependencies were installed. Runtime/compiler pins and actual commands are in the records.

The baseline's USD expenses65,000 leave food5,000 and travel10,000. Declared food7,500 and travel12,000 yield expenses84,500 and remaining−2,500/−2,000. The report includes recorded income500,000, net435,000→415,500 and each occurrence's identity by position. The original fictional ledger, unrelated currency and input write times stay exact. Native integer minor units are used; net is not an account balance.

The 28 additional preimplementation author admission cases remain **unexecuted** and are preserved as prepared inputs. They are neither a passing candidate suite nor independent peer evidence. This packet also makes no author browser/print claim. Separate independent model/rendering and CLI/filesystem reviews are additive companion evidence; their results are not inferred here.

## Exact records and reconstruction

`records.json.gz.b64` is a deterministic compressed archive of 57 declared regular-file aliases and45 unique byte streams. `records-manifest.json` gives every original path, mode, byte count, SHA-256 and Git blob. It preserves selected original baseline inputs/responses, fresh ownership/source captures, the unexecuted28 cases, the source freeze, all authored gate logs and the actual example report. It does not include dependency trees or browser profiles.

Restore into a new directory:

```sh
python3 restore-records.py.txt /existing/NEW-record-directory
```

The restorer verifies the compressed/document/content identities and refuses an existing destination. The `.py.txt` filename is an archival transport name; execute it explicitly with Python. Restoration does not rerun a product test. `restore-proof.json` records actual restoration and subsequent byte/mode readback.

The baseline's full43-file manifest is retained unchanged, but only the selected declared baseline records are archived here. Its source22 is available from the pinned PR8 parent; no missing baseline bytes are synthesized. To repeat product receiving, materialize that exact parent, add the six contribution files, use the unchanged locked dependencies, and run the guide's commands. Environment paths recorded in raw receipts describe the original execution and are not portability promises.

`access-observations.json` explicitly distinguishes tool-observed setup/write failures from product failures. A source-construction syntax error occurred before any write. A guide write timed out; a subsequent read proved the file absent before it was created successfully. Earlier new evidence saves encountered ENOSPC; exact retained connector bytes were later recovered and hash-verified. These observations are not fabricated raw process logs. No failing product gate was silently replaced.

## Release boundary

The current captured canonical main is README-only `c063549f5caae75a6bef764a5da703f0dccfec9f`; the source is held for the existing ce7/61749 integration route. It is not installed, serving or merged.

The exact PR8 CI definition is retained as `pr8-ci.yml.txt` (blob39325b079fb40b0587ec231eeb3328f52e7ece74). It runs on pushes to main and pull requests targeting main, using Ubuntu and Node20, followed by `npm ci`, typecheck and tests. It has no issue/comment trigger. The authored native result above used Node22, not that hosted Node20 job. No hosted gate, PR, merge, deployment, workflow dispatch or Actions-triggering mutation was performed. Publication remains held under the current Actions constraint.
