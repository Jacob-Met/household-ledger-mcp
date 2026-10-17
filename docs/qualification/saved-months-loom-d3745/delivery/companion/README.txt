# Household saved-month finder

Extract this ZIP completely into its own folder. Open OPEN-FIRST.html for the
short visual guide. The folder containing OPEN-FIRST.html is the command root.

Requires an existing Node.js installation. This exact runtime was received on
Linux with Node 24.19.0; no additional npm packages or compilation are needed.
Other operating systems/Node versions were not separately received here.

From a terminal in the extracted folder:

    node tools/household-months.mjs --ledger example/household.json

The included saved synthetic example has four recorded months, eight transaction
occurrences and six budget occurrences. March 2026 is budget-only. The complete
received output is example/discovered-months.json.

For your own existing saved Household Ledger file, supply its path explicitly:

    node tools/household-months.mjs --ledger "/absolute/path/to/ledger.json"

The command reads one saved file and prints JSON. It does not initialize, repair,
change or upload the ledger, start an MCP server, or connect to an account. It
lists recorded month keys and currency/row counts; these are not monetary totals,
deduplicated purchases or evidence that an account is complete. Legacy budgets
without a currency remain unassigned. A true summary_supported flag describes
the existing summary's year range only; other native summary rules still apply.

Normal success is exit 0, including an empty valid ledger. Invalid arguments,
missing/nonregular files, invalid native data, invalid UTF-8/JSON, inputs over
16 MiB or over 100,000 combined rows, and ordinary output failures exit 2. A
failed output sink may contain partial JSON. Never redirect stdout into the
ledger itself: the shell would truncate it before this command reads it. If
saving a report, choose a different new output path deliberately.

## Exact source composition

New CLI/helper: 4d7b36118967a2076fdf642f99da462a8bb862c1
https://github.com/Jacob-Met/household-ledger-mcp/pull/40

The existing emitted validator, ESM marker and saved synthetic example are
retained from qualified PR8 591ab6f5a2d65bf596aeb707dbb635ee981ec926. This package reuses those exact received
bytes; it does not rebuild the validator or claim main/PR8 adoption. The LICENSE
is retained from the same complete source. The new source is a stacked draft
offer over PR8; the repository's separate README-only main remains unchanged.

Qualification: twelve independent CLI cases plus a discovered-month native
consumer; separately one invocation on this exact retained six-file runtime
matched the entire expected result and preserved every input. Anvil independently
reviewed that retained result without another execution. Packaging verified all
ZIP member bytes/modes/CRC without rerunning the command. Original evidence lives
under evidence/. Its absolute workspace paths describe the original observation.

No full compiler/npm suite, MCP/SDK, installation, account or Windows receiving
is claimed. The only supported use represented by this companion is the explicit
offline saved-file command above.
