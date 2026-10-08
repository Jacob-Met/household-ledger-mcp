import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [phase, packetArg, runArg] = process.argv.slice(2);
assert(['initial', 'reopened'].includes(phase));
const packet = resolve(packetArg), run = resolve(runArg);
const expected = JSON.parse(await readFile(join(packet, 'expected.json'), 'utf8'));
const ledgerPath = join(run, 'state', 'household.json');
const csvPath = join(packet, 'fixture.csv');
const { LedgerStore, recordTransaction, setBudget, monthlySummary } = await import(pathToFileURL(join(run, 'emitted', 'ledger.js')).href);
const { previewTransactionImport, commitTransactionImport } = await import(pathToFileURL(join(run, 'emitted', 'transaction-import.js')).href);
const { cashflowTrend } = await import(pathToFileURL(join(run, 'emitted', 'cashflow.js')).href);
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => JSON.parse(JSON.stringify(value));
const receipt = {
  schema: 'household.import-cashflow.phase.v1', phase, pid: process.pid, node: process.version,
  at: new Date().toISOString(), checks: [], passed: false,
};
async function snapshot(path) {
  const bytes = await readFile(path);
  const info = await stat(path, { bigint: true });
  return { sha256: hash(bytes), bytes: bytes.length, inode: String(info.ino), modified_ns: String(info.mtimeNs) };
}
async function check(name, fn) {
  await fn();
  receipt.checks.push({ name, passed: true });
}
function reports(data) {
  const monthly = {}, trends = {};
  for (const currency of ['USD', 'EUR']) {
    monthly[currency] = [2, 3, 4].map(month => monthlySummary(data, 2026, month, currency));
    trends[currency] = cashflowTrend(data, { fromMonth: '2026-02', toMonth: '2026-04', currency });
  }
  return plain({ monthly, trends });
}
const csv = await readFile(csvPath, 'utf8');
const csvBefore = await snapshot(csvPath);
const store = new LedgerStore(ledgerPath);
try {
  await check('Exact original CSV bytes bind the declared synthetic categorized rows', () => {
    assert.equal(csvBefore.sha256, expected.csv_sha256);
    assert.equal(Buffer.byteLength(csv), csvBefore.bytes);
  });
  if (phase === 'initial') {
    receipt.original = await store.update(data => ({
      transaction: recordTransaction(data, expected.original_transaction_input),
      budget: setBudget(data, expected.original_budget.category, expected.original_budget.month,
        expected.original_budget.limitMinor, expected.original_budget.currency),
    }));
    receipt.seed_snapshot = await snapshot(ledgerPath);
    await writeFile(join(run, 'before-import-ledger.json'), await readFile(ledgerPath), { flag: 'wx' });
    receipt.preview = await previewTransactionImport(store, { csv });
    await check('Categorized preview has exact seven rows and denomination totals without changing existing native state', async () => {
      assert.equal(receipt.preview.canCommit, true);
      assert.deepEqual(receipt.preview.counts, { total: 7, add: 7, alreadyRecorded: 0, conflict: 0 });
      assert.deepEqual(receipt.preview.rows.map(row => row.input), expected.rows);
      assert.deepEqual(receipt.preview.totals, { allRows: expected.import_totals, additions: expected.import_totals });
      assert.equal(receipt.preview.sourceSha256, expected.csv_sha256);
      assert.deepEqual(await snapshot(ledgerPath), receipt.seed_snapshot);
    });
    receipt.commit = await commitTransactionImport(store, { csv, reviewToken: receipt.preview.reviewToken });
    let data = await store.load();
    await check('Complete import retains original record and budget and persists every exact supplied category', () => {
      assert.equal(receipt.commit.added, 7);
      assert.equal(receipt.commit.alreadyRecorded, 0);
      assert.deepEqual(receipt.commit.totals, expected.import_totals);
      assert.deepEqual(data.transactions, [receipt.original.transaction, ...receipt.commit.transactions]);
      assert.deepEqual(data.budgets, [receipt.original.budget]);
      assert.deepEqual(receipt.commit.transactions.map(({ id, createdAt, ...input }) => input), expected.rows);
      assert.equal(new Set(data.transactions.map(transaction => transaction.id)).size, 8);
    });
    receipt.assigned_budgets = await store.update(current => expected.budgets_to_add.map(budget =>
      setBudget(current, budget.category, budget.month, budget.limitMinor, budget.currency)));
    data = await store.load();
    await check('Native denominated budget writes preserve imported and original transactions plus unrelated existing budget', () => {
      assert.equal(data.version, 2);
      assert.deepEqual(data.transactions, [receipt.original.transaction, ...receipt.commit.transactions]);
      assert.deepEqual(data.budgets, [receipt.original.budget, ...expected.budgets_to_add]);
      assert.deepEqual(receipt.assigned_budgets, expected.budgets_to_add);
    });
    receipt.before_reports_snapshot = await snapshot(ledgerPath);
    const dataBeforeReports = JSON.stringify(data);
    receipt.reports = reports(data);
    await check('Monthly summaries consume imported categories and select matching denominated budgets exactly', () => {
      assert.deepEqual(receipt.reports.monthly, expected.reports.monthly);
    });
    await check('Cashflow consumes the same categorized snapshot, retains the empty month, and produces exact separate-currency cumulative totals', () => {
      assert.deepEqual(receipt.reports.trends, expected.reports.trends);
    });
    await check('Summary and cashflow reads preserve both in-memory state and the complete saved JSON snapshot', async () => {
      assert.equal(JSON.stringify(data), dataBeforeReports);
      assert.deepEqual(await snapshot(ledgerPath), receipt.before_reports_snapshot);
    });
    receipt.saved_data = data;
    receipt.saved_snapshot = await snapshot(ledgerPath);
    await writeFile(join(run, 'before-replay-ledger.json'), await readFile(ledgerPath), { flag: 'wx' });
    await check('Original CSV remains exact after import, native budget writes and reports', async () => {
      assert.deepEqual(await snapshot(csvPath), csvBefore);
    });
  } else {
    const first = JSON.parse(await readFile(join(run, 'initial.json'), 'utf8'));
    receipt.initial_pid = first.pid;
    receipt.before = await snapshot(ledgerPath);
    let data = await store.load();
    await check('A distinct sequential Node process reopens the exact persisted original/imported records and denominated budgets', () => {
      assert.notEqual(process.pid, first.pid);
      assert.deepEqual(receipt.before, first.saved_snapshot);
      assert.deepEqual(data, first.saved_data);
    });
    const beforeReadData = JSON.stringify(data);
    receipt.reports_before_replay = reports(data);
    await check('Reopened monthly and cashflow reports match the pre-restart numeric oracle without state mutation', async () => {
      assert.deepEqual(receipt.reports_before_replay, expected.reports);
      assert.deepEqual(receipt.reports_before_replay, first.reports);
      assert.equal(JSON.stringify(data), beforeReadData);
      assert.deepEqual(await snapshot(ledgerPath), receipt.before);
    });
    receipt.preview = await previewTransactionImport(store, { csv });
    await check('Replay preview distinguishes zero additions from the original batch totals used by reports', async () => {
      assert.equal(receipt.preview.canCommit, true);
      assert.deepEqual(receipt.preview.counts, { total: 7, add: 0, alreadyRecorded: 7, conflict: 0 });
      assert.deepEqual(receipt.preview.totals, { allRows: expected.import_totals, additions: [] });
      assert.equal(receipt.preview.reviewToken, first.preview.reviewToken);
      assert.deepEqual(receipt.preview.rows.map(row => row.existingTransaction), first.commit.transactions);
      assert.deepEqual(await snapshot(ledgerPath), receipt.before);
    });
    receipt.replay = await commitTransactionImport(store, { csv, reviewToken: first.preview.reviewToken });
    data = await store.load();
    await check('Original reviewed CSV replay returns every original recording without transaction or budget changes', () => {
      assert.equal(receipt.replay.added, 0);
      assert.equal(receipt.replay.alreadyRecorded, 7);
      assert.deepEqual(receipt.replay.totals, []);
      assert.deepEqual(receipt.replay.transactions, first.commit.transactions);
      assert.deepEqual(data, first.saved_data);
    });
    const afterReadData = JSON.stringify(data);
    receipt.reports_after_replay = reports(data);
    await check('Replay does not double monthly/category spending, alter budget overage, or inflate interval cashflow', () => {
      assert.deepEqual(receipt.reports_after_replay, expected.reports);
      assert.deepEqual(receipt.reports_after_replay, receipt.reports_before_replay);
      assert.equal(JSON.stringify(data), afterReadData);
    });
    receipt.after = await snapshot(ledgerPath);
    await check('Saved JSON bytes, inode and mtime stay exact through reopened reads and replay; original CSV is unchanged', async () => {
      assert.deepEqual(receipt.after, first.saved_snapshot);
      assert.deepEqual(await readFile(ledgerPath), await readFile(join(run, 'before-replay-ledger.json')));
      assert.deepEqual(await snapshot(csvPath), csvBefore);
    });
  }
  receipt.csv_snapshot = await snapshot(csvPath);
  receipt.passed = true;
} catch (error) {
  receipt.failure = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await writeFile(join(run, phase + '.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ phase, pid: process.pid, passed: receipt.passed, check_groups: receipt.checks.length, failure: receipt.failure }));
}
