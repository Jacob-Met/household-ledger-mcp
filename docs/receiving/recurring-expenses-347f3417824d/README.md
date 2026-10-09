# Recurring-expense producer qualification

This receiving contribution adds a pure recurring-rule planner, an explicit one-shot CLI, maintained tests and a guide for issue #18. The producer returns an ordinary `household-expense-plan/1` plan for the unchanged consumer. It does not schedule work or record a ledger entry.

## Source boundary

The inherited source parent is `a74357bac7cf888e02b49c0d0cfa5f48c1fecf7b` (tree `56176c99771858cfe83df5270f6d15685a6e2165`, 161 leaves). Independent source review preserved every inherited leaf and mode and added five maintained files. The resulting source-only tree is `7c5341ef299d5e9e35a3b47481c4b5e3a7597272` with 166 leaves. This evidence directory is additional to that tree.

## What was received

| Evidence | Result |
| --- | --- |
| Original unchanged consumer | 3/3 independent controls before producer implementation, including rejection of recurring rules as an unsupported explicit-plan input |
| Author v1 | Isolated compile and 15 maintained tests passed; no independent v1 matrix ran |
| Post-freeze negative probes | The author preserved eight failing bigint/array cases raised in author/root review and six failing Proxy cases raised in independent source review |
| Author v2 | Compile, 17 maintained tests and both focused probes passed after the narrow admission correction |
| Independent v2 | API 10/10 groups, physical CLI 4/4 and stdout-failure supplement 3/3; all 38 bound inputs remained exact |
| Source and archive receiving | Every inherited source leaf preserved; final source, compiled modules, sealed drivers, manifests and portable archive contents bound by exact hashes |

The original missing-feature control rejected a recurring-rules object in the unchanged explicit-plan consumer. It was not a run of the new producer. The later negative probes were source-review findings after v1 freeze, not pre-candidate independent oracles. Their failed results remain in the author packet. A preliminary resource-parser wrapper failure is also retained. The v1 build's package-ancestry limitation remains historical; the package supplied for portable replay does not rewrite it. Final v2 compiled modules are governed by the exact inherited package, and the three inherited compiled modules match the original donor.

## Portable packets

- `author-v2.tar.gz` contains exact final source and compiled files, maintained tests, the contract, historical failures and author qualification evidence. Its README gives bounded replay commands and the limits of that evidence. Derived public evidence has documented private-path substitutions; raw private originals are preserved separately.
- `independent-v3.tar.gz` receives product v2. It contains the unchanged pre-exposure drivers and oracles, exact runtime package/modules, synthetic physical examples and a derived qualification summary. Packet revision v3 corrects one README attribution sentence; it does not change product source, tests, drivers or results.
- `qualification.json` gives complete archive pins, the five final maintained source pins, compiled identities, qualification attribution and practical limits.

These packets were checked without executing product behavior again. The observed runtime was macOS with Node 26.3.0. There is no cross-platform or cross-version matrix, full-service build, hosted-check result or product-adoption claim here. A generated explicit plan carries no currency field, so its consumer must receive the matching currency and month. A receipt-delivery failure can leave a complete plan file; treat any nonzero CLI status as failure.
