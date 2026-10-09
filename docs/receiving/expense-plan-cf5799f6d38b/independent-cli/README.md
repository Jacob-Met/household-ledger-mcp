# Independent Household expense-plan CLI receiving

This strictly additive packet receives issue 14 against PR8 commit 591ab6f5a2d65bf596aeb707dbb635ee981ec926 and unchanged candidate tree 4da046012fb5b0007005204d624dc8b495e79c1c. It contains no application source changes. Author and optimizer receiving remain separately attributed.

The source-blind baseline passed 58 native controls in five groups using unchanged ledger functions. The independent CLI receiver was then frozen before candidate access. Its first actual run passed 18 of 19 groups: the empty plan correctly produced explicit no-additions prose and zero/equal native data, but the receiver had incorrectly required an expense table. That failure is preserved. Root read the exact 29-line receiver-only correction and preservation proof before authorizing one corrected run. The correction applies only to the empty state, requires zero occurrence rows and exact recorded/hypothetical equality, and leaves all nonempty, refusal and mutation predicates byte-exact.

The corrected run passed 19/19 groups on the same source: 16 ordinary CLI cases and three supplemental controlled filesystem mutations. Node 22.22.1 satisfies the project's Node 20+ requirement. Both generations retain their actual commands, input identities, stdout/stderr, reports, source custody and receiver pins. All 31 owner/private source and compiled files remained unchanged. No further test or browser execution occurred during archival assembly.

Ordinary cases cover the five-expense plan, empty plan and a new between-invocation snapshot, plus 13 refusals involving existing destinations, input aliases, hardlinks, symlinks, directory paths, malformed or late-invalid data, forbidden recording keys and outside-month dates. They check input bytes, device/inode, size, mode and modification time, and preserve existing output bytes/identity. Supplemental cases alone use an explicit external Node filesystem preload to perform real late ledger append, same-byte plan inode replacement and competing destination creation. Those three are instrumented final-publication-fence checks, not ordinary uninstrumented cases. Their triggers and real mutation outcomes are archived.

The fictional plan adds 6,600 minor units to 20,000 recorded expenses, yielding 26,600; monthly net moves from 182,000 to 175,400. Groceries reach 20,500 against a 20,000 limit; transit reaches 4,001 against 4,000. These are detached hypothetical native summaries, not an account balance, settlement inference or financial recommendation. No provider, installed dependency, ledger write, GitHub Action or payment action was invoked by this CLI lane.

## Restore

Using an existing Python 3 installation, run:
    python3 restore-review.py records.json NEW_RESTORED_DIRECTORY

The destination must not exist. The archive losslessly deduplicates identical byte streams; every alias retains its original native path, byte length, SHA-256, Git blob and file mode. The restore verifies each identity and creates regular files only. Historical symlink targets are retained in historical-symlink-metadata.json; inode/hardlink relationships and timestamps remain in original receipts and are not recreated. No archived script executes automatically.

Namespaces: baseline, prepared-cli, empty-successor, candidate-first, candidate-final and external-manifests. The corrected receiver is empty-successor/receive-cli-v2.mjs with its exact adjacent helper, expected data and parser. Actual original commands/source arguments are in the candidate-final process receipts. Replay requires separately obtaining and compiling the pinned author source, plus a new private output directory. The duplicate candidate checkout, installed dependencies and caches are excluded.

The baseline ENOSPC, timed-out initial receiver write and absent-target readback, original empty-table assumption, and device Offline hold remain distinct. A later read-only packaging inventory timed out at MCP -32603 with no PID or durable output; it performed no writes or receiving. Its already-pending proof read returned the frozen 48-line preservation proof, and root explicitly released assembly after that recovery. No failed or unknown run is relabeled as success.

No merged, deployed, current-main or external-publication claim is made. This packet demonstrates archival custody; root's separate intake remains required.
