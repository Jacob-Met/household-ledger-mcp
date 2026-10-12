#!/usr/bin/env node
// Compare built domain directories from the exact predecessor and candidate.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

const [beforeDirectory, afterDirectory] = process.argv.slice(2);
if (!beforeDirectory || !afterDirectory || process.argv.length !== 4) {
  console.error('Usage: node benchmark.mjs BEFORE_BUILT_SRC AFTER_BUILT_SRC');
  process.exit(2);
}
async function implementation(directory) {
  const src = resolve(directory);
  return {
    src,
    cashflow: (await import(pathToFileURL(join(src, 'cashflow.js')).href)).cashflowTrend,
    ledger: await import(pathToFileURL(join(src, 'ledger.js')).href),
  };
}
const before = await implementation(beforeDirectory);
const after = await implementation(afterDirectory);
const hash = value => createHash('sha256').update(value).digest('hex');
const month = index => `${2017 + Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

function fixture(count) {
  return {
    version: 2,
    transactions: Array.from({ length: count }, (_, i) => ({
      id: `synthetic-${i}`, type: i % 3 === 0 ? 'income' : 'expense',
      amountMinor: 1 + (i * 17) % 10_000, currency: i % 5 === 0 ? 'EUR' : 'USD',
      date: (i % 7 === 0 ? '2016-12' : month(i % 120)) + '-15',
      category: ['rent', 'food', '__proto__', 'constructor', 'travel'][i % 5],
      note: 'Synthetic benchmark only', createdAt: '2026-01-01T00:00:00.000Z',
    })),
    budgets: Array.from({ length: 120 }, (_, i) => ({ category: 'food', month: month(i), currency: 'USD', limitMinor: 10_000 })),
  };
}

const directory = await mkdtemp(join(tmpdir(), 'cashflow-scan-benchmark-'));
const rows = [];
try {
  for (const scenario of [
    { name: 'empty-120-months', count: 0, fromMonth: '2017-01', toMonth: '2026-12' },
    { name: 'small-single-month', count: 120, fromMonth: '2026-01', toMonth: '2026-01' },
    { name: 'saved-12000-rows-12-months', count: 12_000, fromMonth: '2021-01', toMonth: '2021-12' },
    { name: 'saved-60000-rows-120-months', count: 60_000, fromMonth: '2017-01', toMonth: '2026-12' },
  ]) {
    const file = join(directory, scenario.name + '.json');
    const bytes = Buffer.from(JSON.stringify(fixture(scenario.count)) + '\n');
    await writeFile(file, bytes);
    const input = { fromMonth: scenario.fromMonth, toMonth: scenario.toMonth, currency: 'USD' };
    const stores = { before: new before.ledger.LedgerStore(file), after: new after.ledger.LedgerStore(file) };
    const data = await stores.before.load();
    const canonical = JSON.stringify(before.cashflow(data, input));
    assert.equal(JSON.stringify(after.cashflow(data, input)), canonical, 'output differs before timing');
    const calculations = { before: [], after: [] };
    const workflows = { before: [], after: [] };
    // Warm each path once; then alternate order to reduce ordering bias.
    for (let repetition = -1; repetition < 7; repetition++) {
      for (const name of repetition % 2 === 0 ? ['after', 'before'] : ['before', 'after']) {
        const implementation = name === 'before' ? before : after;
        let start = performance.now();
        const calculated = JSON.stringify(implementation.cashflow(data, input));
        const calculationMs = performance.now() - start;
        assert.equal(calculated, canonical);
        start = performance.now();
        const loaded = await stores[name].load();
        const delivered = JSON.stringify(implementation.cashflow(loaded, input));
        const workflowMs = performance.now() - start;
        assert.equal(delivered, canonical);
        if (repetition >= 0) {
          calculations[name].push(calculationMs);
          workflows[name].push(workflowMs);
        }
      }
    }
    assert.deepEqual(await readFile(file), bytes, 'read workflow changed its saved ledger');
    rows.push({
      ...scenario, bytes: bytes.length, fixtureSha256: hash(bytes), resultSha256: hash(canonical),
      sameResult: true, savedFileUnchanged: true, samples: 7,
      calculationAndSerializationMs: { before: median(calculations.before), after: median(calculations.after), raw: calculations },
      loadValidateCalculateSerializeMs: { before: median(workflows.before), after: median(workflows.after), raw: workflows },
    });
  }
  console.log(JSON.stringify({
    schema: 'household-cashflow-scan-benchmark/v1', node: process.version, platform: process.platform,
    date: new Date().toISOString(), beforeSource: before.src, afterSource: after.src,
    definition: 'Same synthetic saved files, native LedgerStore.load validation, cashflow call and JSON serialization. Seven samples after one warmup, alternating order. Medians and all raw timings; no hosted/service latency claim.',
    scenarios: rows,
  }, null, 2));
} finally {
  await rm(directory, { recursive: true, force: true });
}
