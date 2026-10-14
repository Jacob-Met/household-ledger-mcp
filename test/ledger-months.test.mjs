import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, symlinkSync, existsSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { summarizeMonths, NOTICE } from '../tools/lib/ledger-months.mjs';
import { monthlySummary } from '../dist/src/ledger.js';

const CLI = fileURLToPath(new URL('../tools/household-months.mjs', import.meta.url));
const row = (id, type, date, currency, category = 'Food', amountMinor = 100) => ({ id, type, date, currency, category, amountMinor, createdAt: 'raw saved label' });
const empty = () => ({ version: 1, transactions: [], budgets: [] });
const group = (currency, transaction_count, income_count, expense_count, budget_count) => ({ currency, transaction_count, income_count, expense_count, budget_count });
const month = (month, summary_supported, transaction_count, budget_count, unassigned_budget_count, currencies) => ({ month, summary_supported, transaction_count, budget_count, unassigned_budget_count, currencies });

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'household-months-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
function call(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024 });
}
function saved(root, name, data) {
  const bytes = Buffer.from(JSON.stringify(data, null, 2) + '\n');
  writeFileSync(join(root, name), bytes);
  return bytes;
}
function refused(p) {
  assert.equal(p.error, undefined);
  assert.equal(p.signal, null);
  assert.equal(p.status, 2);
  assert.equal(p.stdout, '');
  assert.match(p.stderr, /^household-months: /);
}

test('complete mixed months count occurrences, sort keys and retain legacy budget-only rows', () => {
  const data = { version: 2, transactions: [
    row('repeat', 'expense', '2026-10-02', 'usd'),
    row('repeat', 'income', '2026-10-01', ' USD '),
    row('euro', 'expense', '2026-10-03', 'eUr'),
    row('old', 'income', '1969-12-31', 'EUR'),
  ], budgets: [
    { category: 'Travel', month: '2026-12', limitMinor: 300, currency: 'USD' },
    { category: 'Rent', month: '2026-10', limitMinor: 300, currency: 'EUR' },
    { category: 'Legacy', month: '2026-10', limitMinor: 0 },
    { category: 'Legacy', month: '0000-01', limitMinor: 0 },
    { category: 'Legacy', month: '0000-01', limitMinor: 0 },
  ], original_extra: { note: '<literal> café 雪' } };
  const before = JSON.stringify(data);
  const actual = summarizeMonths(data);
  assert.deepEqual(actual, {
    counts: { transactions: 4, budgets: 5, months: 4 },
    months: [
      month('0000-01', false, 0, 2, 2, []),
      month('1969-12', false, 1, 0, 0, [group('EUR', 1, 1, 0, 0)]),
      month('2026-10', true, 3, 2, 1, [group('EUR', 1, 0, 1, 1), group('USD', 2, 1, 1, 0)]),
      month('2026-12', true, 0, 1, 0, [group('USD', 0, 0, 0, 1)]),
    ],
  });
  actual.months[0].budget_count = 99;
  assert.equal(JSON.stringify(data), before);
});

test('empty ledger remains empty and calendar flag boundaries do not promise summary admission', () => {
  assert.deepEqual(summarizeMonths(empty()), { counts: { transactions: 0, budgets: 0, months: 0 }, months: [] });
  const data = { ...empty(), budgets: ['1969-12', '1970-01', '9999-12'].map(month => ({ category: 'Legacy', month, limitMinor: 0 })) };
  const result = summarizeMonths(data);
  assert.deepEqual(result.months.map(x => [x.month, x.summary_supported]), [['1969-12', false], ['1970-01', true], ['9999-12', true]]);
  assert.throws(() => monthlySummary(data, 1970, 1), /no currency/);
});

test('unchanged native validation admits the whole ledger before any projection or row cap', () => {
  assert.throws(() => summarizeMonths([]), /unsupported ledger version/);
  const badTx = { ...empty(), transactions: [row('good', 'income', '2026-01-01', 'USD'), row('bad', 'income', '2026-02-30', 'USD')] };
  assert.throws(() => summarizeMonths(badTx), /real calendar date/);
  assert.throws(() => summarizeMonths({ ...empty(), budgets: [{ category: 'Food', month: '2026-13', limitMinor: 0 }] }), /YYYY-MM/);
  const oversized = { ...empty(), transactions: Array(100_001).fill(row('ok', 'income', '2026-01-01', 'USD')) };
  oversized.transactions[100_000] = row('bad', 'income', 'invalid', 'USD');
  assert.throws(() => summarizeMonths(oversized), /YYYY-MM-DD/);
});

test('exact combined row cap includes budget occurrences', () => {
  const data = { ...empty(), transactions: Array(99_999).fill(row('repeat', 'income', '2026-01-01', 'USD')), budgets: [{ category: 'Legacy', month: '2026-01', limitMinor: 0 }] };
  assert.deepEqual(summarizeMonths(data).counts, { transactions: 99_999, budgets: 1, months: 1 });
  data.budgets.push({ category: 'Other', month: '2026-02', limitMinor: 0 });
  assert.throws(() => summarizeMonths(data), /100000 combined/);
});

test('actual CLI emits exact JSON provenance and preserves input and unrelated sentinel', t => {
  const root = fixture(t);
  const data = { ...empty(), transactions: [row('one', 'expense', '2026-07-10', 'USD')] };
  const bytes = saved(root, 'saved café.json', data);
  writeFileSync(join(root, 'sentinel.txt'), 'unchanged');
  const p = call(root, ['--ledger', './saved café.json']);
  assert.equal(p.status, 0); assert.equal(p.stderr, '');
  const expected = { schema_version: 1, kind: 'household.saved-months', source: { path: './saved café.json', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }, counts: { transactions: 1, budgets: 0, months: 1 }, months: [month('2026-07', true, 1, 0, 0, [group('USD', 1, 0, 1, 0)])], notice: NOTICE };
  assert.equal(p.stdout, JSON.stringify(expected, null, 2) + '\n');
  assert.deepEqual(readFileSync(join(root, 'saved café.json')), bytes);
  assert.equal(readFileSync(join(root, 'sentinel.txt'), 'utf8'), 'unchanged');
});

test('usage and help are admitted before opening an input', t => {
  const root = fixture(t);
  const help = call(root, ['--help']);
  assert.equal(help.status, 0); assert.match(help.stdout, /^Usage:/); assert.equal(help.stderr, '');
  for (const args of [[], ['--ledger'], ['--ledger', 'missing.json', '--ledger', 'again'], ['--other', 'missing.json'], ['--ledger', '']]) {
    const p = call(root, args); refused(p); assert.match(p.stderr, /Usage:/); assert.doesNotMatch(p.stderr, /ENOENT/);
  }
  assert.equal(existsSync(join(root, 'missing.json')), false);
});

test('missing and nonregular inputs refuse; an ordinary file symlink retains its selector', t => {
  const root = fixture(t);
  refused(call(root, ['--ledger', 'absent-parent/file.json']));
  assert.equal(existsSync(join(root, 'absent-parent')), false);
  mkdirSync(join(root, 'directory'));
  refused(call(root, ['--ledger', 'directory']));
  saved(root, 'actual.json', empty());
  symlinkSync('actual.json', join(root, 'link.json'));
  const p = call(root, ['--ledger', 'link.json']);
  assert.equal(p.status, 0); assert.equal(JSON.parse(p.stdout).source.path, 'link.json');
});

test('UTF-8, JSON and excluded neighboring data failures produce no partial list', t => {
  const root = fixture(t);
  const bodies = [Buffer.from([0xff]), Buffer.from('{'), Buffer.from('null'), Buffer.from(JSON.stringify({ ...empty(), transactions: [row('bad', 'income', '2026-99-99', 'USD')] }))];
  bodies.forEach((bytes, i) => {
    const name = `bad-${i}.json`;
    writeFileSync(join(root, name), bytes);
    refused(call(root, ['--ledger', name]));
    assert.deepEqual(readFileSync(join(root, name)), bytes);
  });
});

test('16 MiB complete input is admitted and one extra byte refuses', t => {
  const root = fixture(t);
  const small = Buffer.from(JSON.stringify(empty()));
  const atLimit = Buffer.concat([small, Buffer.alloc(16 * 1024 * 1024 - small.length, 0x20)]);
  writeFileSync(join(root, 'limit.json'), atLimit);
  const p = call(root, ['--ledger', 'limit.json']);
  assert.equal(p.status, 0); assert.equal(JSON.parse(p.stdout).source.bytes, atLimit.length);
  writeFileSync(join(root, 'over.json'), Buffer.concat([atLimit, Buffer.from(' ')]));
  refused(call(root, ['--ledger', 'over.json']));
});

test('failed stdout sink exits two without changing the selected input', { skip: !existsSync('/dev/full') }, t => {
  const root = fixture(t);
  const bytes = saved(root, 'ledger.json', empty());
  const sink = openSync('/dev/full', 'w');
  try {
    const p = spawnSync(process.execPath, [CLI, '--ledger', 'ledger.json'], { cwd: root, encoding: 'utf8', stdio: ['ignore', sink, 'pipe'], timeout: 15_000 });
    assert.equal(p.status, 2); assert.match(p.stderr, /^household-months: /);
  } finally { closeSync(sink); }
  assert.deepEqual(readFileSync(join(root, 'ledger.json')), bytes);
});

test('an explicit discovered eligible month can be consumed by the unchanged monthly summary', () => {
  const data = { ...empty(), transactions: [row('salary', 'income', '2026-06-01', 'USD', 'Work', 1000), row('food', 'expense', '2026-06-02', 'USD', 'Food', 250)], budgets: [{ category: 'Food', month: '2026-06', limitMinor: 300 }] };
  const before = JSON.stringify(data);
  const found = summarizeMonths(data).months[0];
  assert.equal(found.month, '2026-06'); assert.equal(found.summary_supported, true);
  const [year, monthNumber] = found.month.split('-').map(Number);
  const result = monthlySummary(data, year, monthNumber, found.currencies[0].currency);
  assert.deepEqual([result.incomeMinor, result.expenseMinor, result.netMinor], [1000, 250, 750]);
  assert.deepEqual(result.budgets, [{ category: 'Food', limitMinor: 300, spentMinor: 250, remainingMinor: 50, over: false }]);
  assert.equal(JSON.stringify(data), before);
});
