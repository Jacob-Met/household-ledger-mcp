# Independent installed receiving: Household saved-ledger CSV

The new installed saved-file command passed the frozen F1–F3 receiving contract on 2026-10-09 at 06:56:27 UTC. There were exactly two actual product calls. The independent controller exited 0 with a reported outer runtime of 0.33 seconds; its recorded receiving interval was 0.22283941693603992 seconds.

## Actual user operation

From /tmp, the receiver invoked the actual executable at /Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7/household-snapshot-csv with explicit absolute --ledger and --output arguments. The input was the original read-only fictional saved ledger at /Users/me/Developer/household-snapshot-csv-c945953fdeb7/originals/ordinary/ledger.json. The new output is retained physically at /Users/me/Developer/household-snapshot-csv-receiving-c945953fdeb7/delivery/statement.csv.

| Receiving observation | Actual process | Exit | Measured command time | Result |
| --- | ---: | ---: | ---: | --- |
| F1: new physical CSV | 90895 | 0 | 0.08690887503325939 s | Exact complete original 976-byte CSV, eight rows |
| F2: same existing output | 90898 | 1 | 0.08168833400122821 s | Existing-output diagnostic; output unchanged |
| F3: preservation and closure | Controller 90853 | 0 after completion | Included in receiving interval | All declared original/installed files unchanged; both children absent |

F1 stdout contains the actual structured receipt: captured source size 2,405 bytes and SHA256 ca1602b160685b5605c84390e60338c4e5317238d0a8ccf6f24a55bacba37f09, empty selectors, physical output size 976 bytes, eight rows and SHA256 24113776afdf40feea50b26dfee4170ed850dd0851b8e7b6cefff7616e095be2. Physical readback matched every byte of the separately retained original expected CSV. The receiver did not generate that expectation using the new command or exporter.

The output Git identity is 6cca2120e1381f89777d367b75cb9f1c868cc4cc. This identity matches the older qualified CSV because the bytes match; the new file's actual creation, distinct native path, mode 0600, mtime and command receipt establish this receiving's physical delivery. It is not a reconstructed artifact.

Independent CSV parsing confirmed the original nine columns and exact eight-row order, including tied dates. Whole-byte comparison preserves embedded CRLF/CR/LF, quotes, Unicode, NUL, literal formula-like strings, original currency spelling, maximum safe integer minor units and the permitted empty legacy timestamp. There is no spreadsheet-execution, conversion, backup or importer-roundtrip claim.

F1 stderr was empty. F2 stdout was empty; its 128-byte stderr contained the expected existing-output diagnostic naming the actual requested file. The existing file's bytes, mode and mtime stayed exact, and the delivery directory contained only statement.csv. No command staging sibling survived.

## Source, installation and original authority

Contract 2012387eec7356f3035e85fd06d370ed163a7cc3 was frozen from the original-only source/fixture/CSV before candidate exposure and author execution. Private author drafting could precede the freeze and is explicitly disclosed in the source-preparation receipt. The unchanged independent receiver source is 6498e78571eefb181720758e9e06c961f5f5468b, 12,823 bytes, SHA256 a03dbcea313d2ce8445d156651b02ef65bbd0d868d9373af101ec887aff7ee0d. It was uploaded/read back and retained natively before either product call.

The actual installation marker is 72ad7f6866e200910664bfc4cf385abe59b05c61, 8,134 bytes, SHA256 258eac826ec2c4591dfff75ec9c92fa877f81755752d3648dab30d49ec8a633f. The installation has 19 files and 963,062 bytes. The author receipt 343a733eae520fb3c28658d4138bbc8b78c10c14 retains actual installation exit 0, installed invalid-JSON refusal exit 2 and existing-installation refusal exit 1; these author cases were reviewed and were not rerun.

The receiver read the complete new CLI, installer, launcher, guide, provenance manifest, ESM loader metadata and installed marker. The new entry captures one explicit regular saved file, applies unchanged validateLedgerData and exportTransactionsCsv, writes a completed and synced private sibling, and publishes with an exclusive hard link. It does not instantiate a Store or start the MCP service. The launcher preserves caller cwd and arguments and invokes the retained existing Node path. The two unchanged original emitted modules retain identities 003fe1cb4fbca02d9dc127804e7f31284192a197 and ecf572a57c648ea2e74a1f2ee842503355581406.

Original source authority remains artifact commit aac08aa93db2872aa1ff69e6bbd3844f0dfde015, native content tree 81aeb4162cf6d793093f920ac7ca03a520169258 and native parent 2b77b81ad59c5f3255aa25c37110e91d3bad6a01. Original-only capsule 96e66759de9b5b390d72fe5142642392b80ad3d8 binds the original fixtures and qualification. Exact original source/CSV behavior comes from that prior independent receiving; this work receives the new installed saved-file delivery boundary.

## Preservation, guards and limits

The independent before/after inventories are byte-identical JSON with Git identity b97d02cdff949ab4632cc7254d2e6b09bdfcbcae. They prove exact bytes, SHA256, Git identity, mode and mtime for all 19 installed files, eight source files and 12 offered original files, including the original archive and original-only capsule. The selected existing Node file and both offered author receipts also remained exact. The original ledger stayed mode 0444.

The controller observed both command exits and fresh ps absence for PIDs 90895 and 90898. Actual outer tool completion separately records controller 90853 exit 0. No browser, listener, SDK, service, old exporter matrix, installer rerun or additional product call was started.

Fresh admission retained 256 MiB free disk and 2 GiB conservative free + inactive + speculative RAM floors, a 4 MiB combined author/installation cap, a separate 512 KiB receiver cap, 30 seconds per command and 180 seconds for receiving. During execution the smallest observed disk was 943,738,880 bytes and conservative RAM was 12,898,025,472 bytes. Author plus installation stayed 2,102,247 bytes. The completed original receiving files total 69,243 bytes before this additional custody/report material.

The existing 99cea MCP statement/client/service/export/package route and ce7/61749 aggregate adoption remain separately owned. This receives a newly installed offline command using exact original domain/export code. It does not establish central adoption, a new financial-data fixture, hosted deployment, automatic ledger discovery or an expanded exporter matrix.

## Evidence

RECEIVING.json is the unchanged native receipt, Git 5e6e924a0caa02e729f69db761187f826f77d0fa, 14,876 bytes, SHA256 94a1cc3818a52ee6d79d8bba7d1ea215843ea759da9ef2b66e6b6a0aae338d3b. It binds the contract, source freeze, actual command logs, physical CSV, three receiving groups, before/after inventories, authority and guards. Those 15 original receiving files remain unchanged.

TRANSPORT.json retains actual native tool start/completion records. OUTER-CLOSURE.json adds a final read-only observation of known owned process absence and preserves the original result. CUSTODY.json maps the complete native file set; ARTIFACTS.json is a UTF-8 JSON carrier whose content strings preserve each file's original bytes after UTF-8 encoding, including the CSV's CRLF and NUL. Individual Git IDs must be described as uploaded/read back only after that transfer actually succeeds. The separate portable map records those completed transfers.

No failure occurred in this two-call receiving; no observation, product source or expected CSV was revised after execution. Existing installations and original assets were left unchanged. No GitHub ref, PR, merge or workflow was created by receiving. Unreferenced raw Git custody is not a durable retention guarantee; root controls source/evidence composition and publication.
