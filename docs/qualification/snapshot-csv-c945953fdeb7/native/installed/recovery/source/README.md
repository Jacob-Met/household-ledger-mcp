# Household saved-ledger CSV

This installed command reads one explicit saved Household Ledger JSON file and creates a complete new CSV statement. It uses the already qualified ledger validator and CSV exporter unchanged. It does not need the MCP service, SDK, npm or a running server.

## Use

Invoke the installed entry by its absolute path from any working directory:

```sh
/Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7/household-snapshot-csv \
  --ledger /absolute/path/to/saved-ledger.json \
  --output /absolute/path/to/new-statement.csv
```

The input must already exist, and the output's parent directory must already exist. Choose a new output filename. The command never overwrites an existing file or link and does not create directories. Relative paths are resolved from your current working directory. A file named `-` is an ordinary path; this command does not infer standard input or output.

Optional selectors are `--type income|expense`, `--category TEXT`, `--from YYYY-MM-DD` and `--to YYYY-MM-DD`. They retain the original exporter's exact matching, inclusive date boundaries and original ordering. Category case and whitespace remain significant. Quote a selector containing spaces; an explicitly empty category remains an empty selector value. Unknown or repeated options are refused. Use `--help` alone for usage.

Successful CSV creation prints a JSON receipt with the captured source path, bytes and SHA256, the exact selectors, and the output path, row count, byte count and SHA256. Exit 0 means complete CSV delivery or help. Exit 2 means a usage, UTF-8, JSON or original validation refusal. Exit 1 means a filesystem or delivery failure. Diagnostic JSON is written to standard error.

## Saved-file and output behavior

The command captures one regular saved input file, at most 8 MiB, through a read-only descriptor. It refuses a final-component symbolic link and detects a size or metadata change during capture. It validates the complete captured ledger before selecting transactions. It does not discover, open or mutate a live Store, repair JSON, change budgets or rewrite the input.

The original exporter allows at most 5,000 matching rows and 1 MiB of UTF-8 CSV. The statement has nine quoted columns: `id,type,amountMinor,currency,date,category,note,idempotencyKey,createdAt`, with CRLF record terminators. Values remain literal, including Unicode, line breaks, formula-like text, original currency spelling, integer minor units and permitted legacy timestamp text. This is a transaction statement; it is not a ledger backup, budget export, currency conversion or spreadsheet sanitization.

The command writes a unique private sibling of the requested output, syncs and closes the complete CSV, then creates the final name with an exclusive hard link. A filesystem that does not support that operation returns a delivery error. There is no overwrite or copy fallback. Ordinary completion removes only that command's private staging file. A cleanup warning after publication means a complete output exists and identifies the retained staging file. If receipt delivery fails after publication, exit 1 reports that the complete output remains when standard error is available. A killed process can leave its uniquely named staging file; it does not expose a partly written final CSV.

## Installed identity and recovery

`INSTALLATION.json` records the exact source, original archive, all installed files except the marker itself, and the existing Node runtime selected during installation. The executable uses that resolved Node v26.3.0 path and the absolute installed helper path while preserving your working directory and arguments. It removes `NODE_OPTIONS` and `NODE_PATH` only from its own child environment. It does not change PATH, register a package binary, install dependencies or update the runtime. If that retained Node binary is removed, restore or select the intended existing runtime during a separate installation.

The `recovery` directory contains the unchanged original qualified archive and the complete eight-file source input directory. The installer admits the original compressed archive's exact byte count and SHA256, verifies the selected original module and example bytes, and refuses any existing destination. It writes `INSTALLATION.json` last, and the installed launcher refuses a missing marker. A partial new destination is preserved on failure for inspection.

For a separate recovery installation, invoke the retained installer with a new destination and an owned root containing the retained source:

```sh
/Library/Frameworks/Python.framework/Versions/3.13/bin/python3 \
  /Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7/recovery/source/install.py \
  --archive /Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7/recovery/original-qualified-owner-archive.tar.gz \
  --destination /Users/me/Applications/HouseholdSnapshotCSV-recovered-c945953fdeb7 \
  --owned-root /Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7 \
  --node /opt/homebrew/bin/node
```

Recovery into that example new destination has not been executed. The installer keeps a combined 4 MiB allocation for its existing owned preparation tree and new installation, with at least 256 MiB free disk and 2 GiB conservative available RAM on this Mac. It does not delete any existing installation to make room.

`examples/fictional-ledger.json` and `examples/expected-statement.csv` preserve the original independent receiver's saved fictional ledger and actual delivered statement. The ledger is read-only. They are examples and receiving inputs, not personal financial data.

## Source provenance and ownership

The unchanged runtime files come from the original 861,340-byte archive at artifact commit `aac08aa93db2872aa1ff69e6bbd3844f0dfde015`, Git blob `53c0af2d577119337f3a06ab956373814ffc341d`, SHA256 `1213482711354e8a44f35230dd8d41061ad2cb3f868421075c705318cf9752f0`. The archive identifies native source content tree `81aeb4162cf6d793093f920ac7ca03a520169258` and native source parent `2b77b81ad59c5f3255aa25c37110e91d3bad6a01`. Artifact custody does not make that native source ancestry canonical GitHub ancestry. Exact selected-member and original TypeScript identities are in `INPUTS.json`; the original source package remains in the retained archive.

- [Original export offer](https://github.com/Jacob-Met/household-ledger-mcp/issues/7#issuecomment-6064040050)
- [Original independent native receiving](https://github.com/Jacob-Met/household-ledger-mcp/issues/3#issuecomment-6063996302)
- [Distinct saved-file command reservation](https://github.com/Jacob-Met/household-ledger-mcp/issues/7#issuecomment-6075561537)

This additive source belongs under `tools/snapshot-csv/`. It preserves 99cea's MCP endpoint, statement client, server/export and package-bin ownership; ce7/61749 retain aggregate adoption. An unreadable native advisory was not bypassed. No full native code-claims coverage is asserted.

The original domain/export qualification remains the authority for matching and CSV content. New installed receiving covers this command's physical saved-file operation and preservation. Source storage and any later integration remain subject to the current Actions hold and repository protections.
