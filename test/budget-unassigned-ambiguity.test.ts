import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LedgerStore, ValidationError, validateLedgerData, getBudgets, monthlySummary, setBudget, type LedgerData } from "../src/ledger.js";

const message = "multiple unassigned budgets match this category and month; cannot choose a budget to update";
function fixture(version = 1): LedgerData {
  return JSON.parse(JSON.stringify({version, transactions: [], budgets: [
    {category: "groceries", month: "2026-10", limitMinor: 10000, original: "first é"},
    {category: "groceries", month: "2026-10", limitMinor: 20000, original: "second"},
    {category: "travel", month: "2026-10", limitMinor: 5000},
  ], extension: {literal: "A<B&C"}}));
}
function refusesUnchanged(data: LedgerData, amount: number) {
  const before = JSON.stringify(data);
  const rows = [...data.budgets], array = data.budgets;
  assert.throws(() => setBudget(data, "groceries", "2026-10", amount),
    (error: unknown) => error instanceof ValidationError && error.message === message);
  assert.equal(JSON.stringify(data), before);
  assert.equal(data.budgets, array);
  rows.forEach((row, i) => assert.equal(data.budgets[i], row));
}

test("both admitted versions refuse two unequal legacy rows before mutation", () => {
  for (const version of [1, 2]) {
    const data = fixture(version);
    assert.equal(validateLedgerData(data), data);
    refusesUnchanged(data, 30000);
  }
});

test("equal values and requested no-op still cannot select an occurrence", () => {
  for (const version of [1, 2]) {
    for (const amount of [0, 10000, 30000]) {
      const data = fixture(version);
      data.budgets[1].limitMinor = 10000;
      refusesUnchanged(data, amount);
    }
  }
});

test("repeated references count as multiple occurrences", () => {
  const data = fixture(); data.budgets[1] = data.budgets[0];
  refusesUnchanged(data, 10000);
  assert.equal(data.budgets[0], data.budgets[1]);
});

test("legacy duplicate reads and existing summary refusal are unchanged", () => {
  const data = fixture(); const before = JSON.stringify(data);
  assert.equal(validateLedgerData(data), data);
  const rows = getBudgets(data, "2026-10");
  assert.deepEqual(rows, data.budgets);
  assert.throws(() => monthlySummary(data, 2026, 10), /monthly category budgets have no currency/);
  assert.equal(JSON.stringify(data), before);
});

test("one selected legacy row updates in place with zero and request trimming", () => {
  const data = fixture(2); data.budgets.splice(1, 1);
  const selected = data.budgets[0], untouched = structuredClone(data.budgets[1]);
  const result = setBudget(data, " groceries ", "2026-10", 0);
  assert.equal(result, selected);
  assert.equal(result.limitMinor, 0);
  assert.equal(data.version, 2);
  assert.equal((result as unknown as {original: string}).original, "first é");
  assert.deepEqual(data.budgets[1], untouched);
});

test("duplicates in another month or category do not block a unique selection", () => {
  const data = fixture(); const original = structuredClone(data.budgets);
  setBudget(data, "travel", "2026-10", 4000);
  assert.deepEqual(data.budgets.slice(0, 2), original.slice(0, 2));
  assert.equal(data.budgets[2].limitMinor, 4000);
  const added = setBudget(data, "groceries", "2026-11", 7000);
  assert.deepEqual(added, {category: "groceries", month: "2026-11", limitMinor: 7000});
  assert.equal(data.version, 1);
});

test("an absent legacy scope creates its original row without changing duplicates", () => {
  const data = fixture(); const before = structuredClone(data.budgets);
  const added = setBudget(data, "books", "2026-10", 0);
  assert.deepEqual(data.budgets.slice(0, 3), before);
  assert.equal(data.budgets[3], added);
  assert.deepEqual(added, {category: "books", month: "2026-10", limitMinor: 0});
  assert.equal(data.version, 1);
});

test("explicit legacy assignment retains its original errors and unique success", () => {
  const data = fixture(), before = JSON.stringify(data);
  assert.throws(() => setBudget(data, "groceries", "2026-10", 30000, "USD"),
    /budget has no assigned currency; supply replaceUnassigned: true/);
  assert.throws(() => setBudget(data, "groceries", "2026-10", 30000, "USD", true),
    /multiple unassigned budgets match this category and month; cannot choose a budget to replace/);
  assert.equal(JSON.stringify(data), before);
  data.budgets.splice(1, 1);
  const selected = data.budgets[0];
  assert.equal(setBudget(data, "groceries", "2026-10", 30000, "usd", true), selected);
  assert.equal(data.version, 2); assert.equal(selected.currency, "USD");
  assert.equal(selected.limitMinor, 30000);
});

test("denominated updates and original omission refusal retain their semantics", () => {
  const data: LedgerData = {version: 2, transactions: [], budgets: [
    {category: "groceries", month: "2026-10", limitMinor: 100, currency: "USD"},
    {category: "groceries", month: "2026-10", limitMinor: 200, currency: "EUR"},
  ]};
  const before = JSON.stringify(data);
  assert.throws(() => setBudget(data, "groceries", "2026-10", 0),
    /currency is required to update a denominated category budget/);
  assert.equal(JSON.stringify(data), before);
  const usd = data.budgets[0];
  assert.equal(setBudget(data, "groceries", "2026-10", 0, "usd"), usd);
  assert.deepEqual(data.budgets[1], {category: "groceries", month: "2026-10", limitMinor: 200, currency: "EUR"});
});

test("earlier invalid arguments keep their existing refusal precedence", () => {
  const data = fixture(), before = JSON.stringify(data);
  assert.throws(() => setBudget(data, "groceries", "2026-10", -1), /limitMinor must be a non-negative integer/);
  assert.throws(() => setBudget(data, "groceries", "2026-13", 100), /month must be YYYY-MM/);
  assert.throws(() => setBudget(data, "groceries", "2026-10", 100, undefined, true), /replaceUnassigned requires an explicit currency/);
  assert.equal(JSON.stringify(data), before);
});

test("actual Store refusal preserves bytes and identity; queued later update succeeds", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "household41-author-"));
  try {
    const path = join(directory, "fictional ledger é.json");
    const raw = Buffer.from(JSON.stringify(fixture(), null, 2) + "\r\n");
    await fs.writeFile(path, raw, {flag: "wx", mode: 0o600});
    const store = new LedgerStore(path), before = await fs.stat(path, {bigint: true});
    const entries = await fs.readdir(directory);
    await assert.rejects(store.update(data => setBudget(data, "groceries", "2026-10", 30000)),
      (error: unknown) => error instanceof ValidationError && error.message === message);
    assert.deepEqual(await fs.readFile(path), raw);
    const after = await fs.stat(path, {bigint: true});
    for (const key of ["dev", "ino", "mode", "size", "mtimeNs"] as const) assert.equal(after[key], before[key]);
    assert.deepEqual(await fs.readdir(directory), entries);
    await store.update(data => setBudget(data, "travel", "2026-10", 4000));
    const saved = JSON.parse(await fs.readFile(path, "utf8")), expected = fixture();
    expected.budgets[2].limitMinor = 4000;
    assert.deepEqual(saved, expected);
    assert.deepEqual(await fs.readdir(directory), entries);
  } finally { await fs.rm(directory, {recursive: true, force: true}); }
});
