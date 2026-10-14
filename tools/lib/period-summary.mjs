/** Read-only transaction totals for an explicit inclusive calendar-date range. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validateLedgerData, validateDate, ValidationError } from '../../src/ledger.ts';

export const MAX_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
export const MAX_TRANSACTIONS = 100000;
export const MAX_BUDGETS = 100000;
export const MAX_CATEGORIES = 5000;
const MAX_AMOUNT = BigInt(Number.MAX_SAFE_INTEGER);

function requireValue(condition, message) {
  if (!condition) throw new ValidationError(message);
}

function selection(input) {
  requireValue(typeof input === 'object' && input !== null && !Array.isArray(input),
    'period options must contain exactly from, to and currency');
  const keys = Reflect.ownKeys(input);
  requireValue(keys.length === 3 && ['from', 'to', 'currency'].every(key => keys.includes(key)),
    'period options must contain exactly from, to and currency');
  const from = validateDate(input.from);
  const to = validateDate(input.to);
  requireValue(from <= to, 'to must be on or after from');
  const suppliedCurrency = input.currency;
  requireValue(typeof suppliedCurrency === 'string' && /^[A-Za-z]{3}$/.test(suppliedCurrency.trim()),
    'currency must be an explicit 3-letter code');
  return { from, to, currency: suppliedCurrency.trim().toUpperCase() };
}

export function boundedOutput(text) {
  requireValue(Buffer.byteLength(text, 'utf8') <= MAX_OUTPUT_BYTES, 'complete period output exceeds 4 MiB');
  return text;
}

function accumulator() {
  return { counts: { transactions: 0, income: 0, expense: 0 }, income: 0n, expense: 0n };
}

function add(target, transaction) {
  target.counts.transactions++;
  target.counts[transaction.type]++;
  target[transaction.type] += BigInt(transaction.amountMinor);
  requireValue(target.income <= MAX_AMOUNT && target.expense <= MAX_AMOUNT,
    'period gross transaction totals exceed the safe integer range');
}

function amounts(target) {
  return {
    incomeMinor: Number(target.income),
    expenseMinor: Number(target.expense),
    netMinor: Number(target.income - target.expense),
  };
}

/** Admit the whole ledger, then aggregate every matching occurrence. Never mutates data. */
export function summarizePeriod(data, input) {
  const { from, to, currency } = selection(input);
  const admitted = validateLedgerData(data);
  requireValue(admitted.transactions.length <= MAX_TRANSACTIONS, 'ledger exceeds 100000 transactions');
  requireValue(admitted.budgets.length <= MAX_BUDGETS, 'ledger exceeds 100000 budgets');
  const total = accumulator();
  const groups = new Map();
  for (const transaction of admitted.transactions) {
    if (transaction.date < from || transaction.date > to || transaction.currency.trim().toUpperCase() !== currency) continue;
    let group = groups.get(transaction.category);
    if (!group) {
      requireValue(groups.size < MAX_CATEGORIES, 'period exceeds 5000 literal categories');
      group = accumulator();
      groups.set(transaction.category, group);
    }
    add(total, transaction);
    add(group, transaction);
  }
  const result = {
    format: 'household-period-summary', version: 1, from, to, currency,
    counts: total.counts, totals: amounts(total),
    categories: [...groups.keys()].sort().map(category => {
      const group = groups.get(category);
      return { category, counts: group.counts, ...amounts(group) };
    }),
  };
  boundedOutput(JSON.stringify(result, null, 2) + '\n');
  return result;
}

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs;
}

/** Capture one bounded ordinary file. Does not construct the persistence Store. */
async function capture(filename) {
  const path = resolve(filename);
  const named = await lstat(path, { bigint: true });
  if (!named.isFile() || named.isSymbolicLink()) throw new Error('ledger must be a regular file, not a symbolic link');
  requireValue(named.size <= BigInt(MAX_INPUT_BYTES), 'ledger exceeds 8 MiB');
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0));
  let primary;
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || !sameFile(named, before)) throw new Error('ledger identity changed before capture');
    const chunks = [];
    let length = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(65536, MAX_INPUT_BYTES + 1 - length));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      chunks.push(chunk.subarray(0, bytesRead));
      length += bytesRead;
      requireValue(length <= MAX_INPUT_BYTES, 'ledger exceeds 8 MiB');
    }
    const after = await handle.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || !sameFile(before, after) ||
        !sameFile(before, current) || BigInt(length) !== before.size) {
      throw new Error('ledger changed during capture');
    }
    const bytes = Buffer.concat(chunks, length);
    return { bytes, source: { path, bytes: length, sha256: createHash('sha256').update(bytes).digest('hex') } };
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    try { await handle.close(); }
    catch (error) { if (primary === undefined) throw error; }
  }
}

export async function readPeriodSummary(filename, input) {
  const captured = await capture(filename);
  let data;
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(captured.bytes);
    data = JSON.parse(text);
  } catch (error) {
    throw new ValidationError('ledger must contain complete strict UTF-8 JSON: ' + error.message);
  }
  return { source: captured.source, summary: summarizePeriod(data, input) };
}

export function formatPeriodText({ source, summary }) {
  const lines = [
    'Household period summary',
    'Recorded cash flow; amounts are integer minor units, not an account balance.',
    `Inclusive dates: ${summary.from} through ${summary.to}; currency: ${summary.currency}`,
    `Source: ${JSON.stringify(source.path)}`,
    `Captured bytes: ${source.bytes}; SHA-256: ${source.sha256}`,
    `Occurrences: ${summary.counts.transactions} (${summary.counts.income} income, ${summary.counts.expense} expense)`,
    `Income: ${summary.totals.incomeMinor}; expense: ${summary.totals.expenseMinor}; net cash flow: ${summary.totals.netMinor}`,
    'Categories (exact saved labels):',
  ];
  for (const row of summary.categories) {
    lines.push(`${JSON.stringify(row.category)}: income ${row.incomeMinor}; expense ${row.expenseMinor}; net ${row.netMinor}; occurrences ${row.counts.transactions} (${row.counts.income} income, ${row.counts.expense} expense)`);
  }
  if (summary.categories.length === 0) lines.push('(no matching transaction occurrences)');
  lines.push('Budgets are validated but not allocated or evaluated for this period.');
  return boundedOutput(lines.join('\n') + '\n');
}
