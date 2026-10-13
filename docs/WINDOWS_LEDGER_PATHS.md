# Windows ledger path casing

Within one Node process and one loaded copy of this module, LedgerStore updates
through Windows paths that differ by letter case share a mutation queue. Each
operation reloads the ledger after the previous operation has finished, so two
successful recordings retain both records.

For example, Windows can resolve C:\Household\Ledger.json and
c:\household\ledger.json to the same file. The coordination key is case-folded
on Windows; the original resolved pathname remains the path used for every
load and save. Other platforms retain their case-sensitive pathname keys.

## Why this matters

The original queue used the pathname spelling as its exact key. An actual
Windows challenge held one Store callback and started another through a
directory case alias of the same file. Both updates reported success, but the
saved ledger retained only one of their two records. An identical-path control
serialized correctly. A filename case alias also entered concurrently and one
concurrent replacement failed.

The correction changes only the process-local queue key. Transaction admission,
idempotency, ledger bytes, load/save behavior, budgets and currency calculations
keep their existing rules. A refused callback releases the queue for the next
operation, and independent ledger files remain independent.

## Operating boundary

Keep a single writer process for a ledger. This queue does not coordinate
separate Node processes or separate loaded module copies. It also does not
resolve every filesystem alias, including symlinks, junctions, hard links or
short names. Use one stable configured path for those cases.

Existing case-sensitive directories on POSIX systems keep distinct queues for
distinct files such as Ledger.json and ledger.json. Windows coordination may
conservatively serialize distinct case-sensitive files whose names fold alike;
their original paths and contents remain separate.

## Regression checks

Run the maintained suite with npm test. The focused test is
test/ledger-windows-path-queue.test.ts. It uses actual isolated Store instances
and files, including held callbacks, same-file identity checks, filename,
directory and drive case aliases, rejection recovery, independent files and a
case-sensitive POSIX control.

A filesystem that does not provide the required case relationship is reported
as skipped. Platform-excluded cases are not native coverage. Source-mode
receiving, compiled tests, and any full-suite failures must be reported
separately from installed-service adoption.
