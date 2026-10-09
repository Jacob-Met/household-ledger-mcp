# Independent receiving of Household transaction CSV export

Reviewer: worker 7a9310dad255/root. The consumer requirements, separate fictional ledger and real HTTP receiver were frozen before candidate exposure. The author did not supply this receiver's expected CSV or its implementation.

## Exact qualification

Baseline: native 2b77b81ad59c5f3255aa25c37110e91d3bad6a01, tree940438aed7af43d841ff7700da8bd4f83a838afd. The separate original service run at15:22:13UTC made nine actual tool calls: eight frozen selections returned the literal original records in native order, then export_transactions_csv was refused as missing. The original163 source/compiled files and private ledger remained exact. Receiver exited0 in0.690seconds with empty stderr.

Candidate: source tree81aeb4162cf6d793093f920ac7ca03a520169258. All103 source files and78 compiled artifacts matched their pinned manifests before execution. All92 unrelated parent files/modes were exact. Root read the complete new production module and the full existing-file diff: index changes are additive import/tool definition/one actual Store.load dispatch; README adds export usage, and three inherited test edits add the eleventh tool to exact rosters. Existing ledger/filter/store and other handler implementations stay exact.

The unchanged frozen receiver ran at15:28:46–15:28:51UTC on native Node26.3.0. It passed eight actual HTTP groups, made64 tool calls across18 owned private server processes, and saved19 actual CSV responses. The outer receiver exited0 in5.430seconds, with empty stderr. All181 physical source/compiled files stayed exact. Each private service was intentionally stopped with SIGTERM after its client closed; these are recorded shutdown signals, not service exit-zero claims.

## Observed behavior

The actual responses preserve all original fields and native ordering, including tied dates, exact category case/whitespace, mixed original currency spelling, safe maximum integer minor units, absent legacy createdAt, comma/quote/CRLF/LF/CR, combining Unicode, emoji, embedded NUL and formula-like literal strings. The independent CSV reader requires every header/value cell to be quoted, doubled embedded quotes, exactly nine columns, CRLF record endings/final terminator and no BOM. Client-saved bytes are read back and match the reported byteCount and SHA256.

Exactly5000 rows succeed;5001 matches refuse completely while a three-row selection from that ledger succeeds. Exactly1048576 UTF8 bytes succeed. One extra byte, quote expansion and multibyte excess each refuse the whole result. Header-only empty/missing results have92 bytes, and the missing file is not created. Repeat and actual process restart yield identical responses while ledger bytes/mtime/mode remain exact.

Eighteen invalid argument controls refuse through the actual existing SDK/protocol or tool error boundary. Selected wrong-type timestamps or unpaired UTF16 surrogate text refuse; the good selected record from those otherwise native-accepted snapshots succeeds. Malformed JSON, unsupported ledger version and a native-invalid record refuse at the existing Store boundary.

The one-snapshot challenge acquires the actual first file read, then the receiver alone atomically replaces its own fictional file before returning the unchanged original read bytes. A2305-row export still returns every original A record with exactly one actual ledger read; B remains on disk. This intentional receiver write is separate from the unchanged-file checks. The original A fixture is reconstructed for custody from the already frozen deterministic generator and verified against the actual read SHA256; that file is labeled reconstructed, not relabeled as a runtime capture.

## Evidence and limits

runner-freeze.json pins the requirements, fixture, HTTP driver and narrow real-file read observer. baseline-run/ and candidate-run/ preserve complete actual calls, source-before/source-after manifests, server logs, saved CSVs and receipts. No product code, field exclusions or expected values changed during receiving.

The first source admission attempt used the wrong key for the original metadata schema (entries/files instead of its actual source_entries). Its original script and actual exit1 output are retained. admit-candidate-v2.py corrects only that lookup; the full original103/78/97-file identities and tree assertions remain intact. No behavioral test failed and no behavior replay was needed.

This is a bounded statement export with client-side saving. It is not a native backup/import round trip, automatic attachment, hosted service deployment, live-ledger test, spreadsheet execution, currency conversion or financial analysis.

The candidate is accepted for the existing ce7/61749b after-owner receiving route. Native snapshot ancestry and evidence branches must not be merged wholesale into README-only canonical main. Root does not take over aggregate source adoption or issue6's listing-filter scope.

ROOT-MANIFEST.json is the explicit complete receiving-file list and per-file custody index. The manifest itself accompanies its listed files.
