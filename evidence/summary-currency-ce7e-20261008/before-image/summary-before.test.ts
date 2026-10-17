import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const root = process.env.HOUSEHOLD_SUMMARY_SOURCE_ROOT ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../household-summary-successor");
const { createMcpServer } = await import(pathToFileURL(join(root, "dist/src/index.js")).href);
const { LedgerStore } = await import(pathToFileURL(join(root, "dist/src/ledger.js")).href);

type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };

function unpack(value: unknown): any {
  const result = value as Result;
  assert.notEqual(result.isError, true, result.content[0]?.text);
  return JSON.parse(result.content[0].text);
}

async function receiver(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "ledger-summary-before-"));
  const path = join(dir, "ledger.json");
  const server = createMcpServer(new LedgerStore(path));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "summary-before", version: "1" }, { capabilities: {} });
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); await rm(dir, { recursive: true, force: true }); });
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }, undefined, { timeout: 2000 });
  const record = async (amountMinor: number, currency: string, category = "food", date = "2026-10-08") => unpack(await call("record_transaction", { type: "expense", amountMinor, currency, category, date }));
  return { path, call, record };
}

test("mixed USD/EUR recording must not return an unqualified total", async t => {
  const { path, call, record } = await receiver(t);
  await record(500, "USD");
  await record(800, "EUR");
  const before = await readFile(path, "utf8");
  const result = await call("monthly_summary", { year: 2026, month: 10 });
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.equal(await readFile(path, "utf8"), before);
});

test("explicit USD selector must exclude EUR records", async t => {
  const { call, record } = await receiver(t);
  await record(500, "USD");
  await record(800, "EUR");
  const summary = unpack(await call("monthly_summary", { year: 2026, month: 10, currency: "USD" }));
  assert.equal(summary.expenseMinor, 500, JSON.stringify(summary));
  assert.equal(summary.currency, "USD");
});

for (const category of ["constructor", "__proto__", "toString"]) {
  test(`category ${category} must retain finite own totals without changing shared prototypes`, async t => {
    const { call, record } = await receiver(t);
    await record(803, "USD", category);
    unpack(await call("set_budget", { category, month: "2026-10", limitMinor: 800 }));
    const targets = [Object.prototype, Object, Object.prototype.toString];
    const fields = ["incomeMinor", "expenseMinor"];
    const old = targets.map(target => fields.map(field => Object.getOwnPropertyDescriptor(target, field)));
    let summary: any;
    let changed = false;
    try {
      summary = unpack(await call("monthly_summary", { year: 2026, month: 10 }));
      changed = targets.some((target, i) => fields.some((field, j) => JSON.stringify(Object.getOwnPropertyDescriptor(target, field)) !== JSON.stringify(old[i][j])));
    } finally {
      targets.forEach((target, i) => fields.forEach((field, j) => {
        const prior = old[i][j];
        if (prior) Object.defineProperty(target, field, prior);
        else Reflect.deleteProperty(target, field);
      }));
    }
    assert.equal(Object.hasOwn(summary.byCategory, category), true, JSON.stringify(summary));
    assert.equal(summary.byCategory[category].expenseMinor, 803);
    assert.equal(summary.budgets[0].spentMinor, 803);
    assert.equal(summary.budgets[0].remainingMinor, -3);
    assert.equal(summary.budgets[0].over, true);
    assert.equal(changed, false, "summary changed shared prototype state");
  });
}

test("individually safe amounts must not produce an unsafe aggregate", async t => {
  const { path, call, record } = await receiver(t);
  await record(Number.MAX_SAFE_INTEGER, "USD");
  await record(2, "USD");
  const before = await readFile(path, "utf8");
  const result = await call("monthly_summary", { year: 2026, month: 10 });
  assert.equal(result.isError, true, JSON.stringify(result));
  assert.equal(await readFile(path, "utf8"), before);
});

test("single-currency numeric totals and legacy budget control", async t => {
  const { call, record } = await receiver(t);
  await record(803, "USD");
  await record(910, "EUR", "food", "2026-09-08");
  unpack(await call("set_budget", { category: "food", month: "2026-10", limitMinor: 800 }));
  const summary = unpack(await call("monthly_summary", { year: 2026, month: 10 }));
  assert.equal(summary.expenseMinor, 803);
  assert.equal(summary.netMinor, -803);
  assert.equal(summary.budgets[0].remainingMinor, -3);
  assert.equal(summary.budgets[0].over, true);
});

test("exact safe boundary and empty-month controls", async t => {
  const { call, record } = await receiver(t);
  await record(Number.MAX_SAFE_INTEGER - 1, "USD");
  await record(1, "USD");
  const full = unpack(await call("monthly_summary", { year: 2026, month: 10 }));
  assert.equal(full.expenseMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(Number.isSafeInteger(full.netMinor), true);
  const empty = unpack(await call("monthly_summary", { year: 2026, month: 11 }));
  assert.equal(empty.incomeMinor, 0);
  assert.equal(empty.expenseMinor, 0);
});
