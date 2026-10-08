import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/index.js";
import { emptyLedger, LedgerStore } from "../src/ledger.js";

const october = { year: 2026, month: 10 };
type Result = { isError?: boolean; content: Array<{ type: string; text: string }> };

function unpack(result: unknown): any {
  const value = result as Result;
  assert.notEqual(value.isError, true, value.content[0]?.text);
  assert.equal(value.content[0].type, "text");
  return JSON.parse(value.content[0].text);
}

function refused(result: unknown, message: RegExp): void {
  const value = result as Result;
  assert.equal(value.isError, true, JSON.stringify(value));
  assert.match(value.content[0].text, message);
}

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "ledger-summary-currency-"));
  const path = join(dir, "ledger.json");
  const store = new LedgerStore(path);
  await store.save(emptyLedger());
  const clients: Client[] = [];
  const servers: ReturnType<typeof createMcpServer>[] = [];
  t.after(async () => {
    for (const client of clients) await client.close();
    for (const server of servers) await server.close();
    await rm(dir, { recursive: true, force: true });
  });
  const connect = async () => {
    const server = createMcpServer(new LedgerStore(path));
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "currency-receiver", version: "1" }, { capabilities: {} });
    await client.connect(clientTransport);
    clients.push(client);
    servers.push(server);
    return client;
  };
  const client = await connect();
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }, undefined, { timeout: 3000 });
  const record = async (args: Record<string, unknown> = {}) => unpack(await call("record_transaction", {
    type: "expense", amountMinor: 500, currency: "USD", category: "food", date: "2026-10-08", ...args,
  }));
  return { path, client, connect, call, record };
}

test("one monthly currency is labelled automatically and legacy budget amounts stay unchanged", async t => {
  const { path, call, record } = await fixture(t);
  await record({ type: "income", amountMinor: 2500, category: "pay", currency: " usd " });
  await record({ amountMinor: 803 });
  await record({ amountMinor: 999, currency: "EUR", date: "2026-09-30" });
  unpack(await call("set_budget", { category: "food", month: "2026-10", limitMinor: 800 }));
  const before = await readFile(path, "utf8");
  const automatic = unpack(await call("monthly_summary", october));
  assert.equal(automatic.currency, "USD");
  assert.equal(automatic.incomeMinor, 2500);
  assert.equal(automatic.expenseMinor, 803);
  assert.equal(automatic.netMinor, 1697);
  assert.deepEqual(automatic.byCategory, { pay: { incomeMinor: 2500, expenseMinor: 0 }, food: { incomeMinor: 0, expenseMinor: 803 } });
  assert.deepEqual(automatic.budgets, [{ category: "food", limitMinor: 800, spentMinor: 803, remainingMinor: -3, over: true }]);
  const selected = unpack(await call("monthly_summary", { ...october, currency: "usd" }));
  assert.deepEqual(selected, automatic);
  assert.equal(await readFile(path, "utf8"), before);
});

test("mixed monthly currencies refuse an unqualified report without changing records", async t => {
  const { path, call, record } = await fixture(t);
  await record({ amountMinor: 500 });
  await record({ amountMinor: 800, currency: "EUR" });
  const before = await readFile(path, "utf8");
  const result = await call("monthly_summary", october);
  refused(result, /multiple currencies \(EUR, USD\).*supply currency/);
  assert.equal(unpack(await call("list_transactions", {})).total, 2);
  assert.equal(await readFile(path, "utf8"), before);
});

test("the optional selector is discoverable and selects only its normalized currency", async t => {
  const { path, client, call, record } = await fixture(t);
  const tool = (await client.listTools()).tools.find(value => value.name === "monthly_summary")!;
  assert.equal((tool.inputSchema.properties?.currency as { type: string }).type, "string");
  assert.deepEqual(tool.inputSchema.required, ["year", "month"]);
  await record({ type: "income", amountMinor: 1000, category: "pay" });
  await record({ amountMinor: 250 });
  await record({ type: "income", amountMinor: 700, category: "pay", currency: "EUR" });
  await record({ amountMinor: 90, currency: "EUR" });
  const before = await readFile(path, "utf8");
  const usd = unpack(await call("monthly_summary", { ...october, currency: " usd " }));
  assert.equal(usd.currency, "USD");
  assert.equal(usd.incomeMinor, 1000);
  assert.equal(usd.expenseMinor, 250);
  assert.equal(usd.netMinor, 750);
  assert.deepEqual(usd.byCategory, { pay: { incomeMinor: 1000, expenseMinor: 0 }, food: { incomeMinor: 0, expenseMinor: 250 } });
  const eur = unpack(await call("monthly_summary", { ...october, currency: "eUr" }));
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.incomeMinor, 700);
  assert.equal(eur.expenseMinor, 90);
  assert.equal(eur.netMinor, 610);
  assert.deepEqual(eur.budgets, []);
  assert.equal(await readFile(path, "utf8"), before);
});

test("empty and absent-currency reports never invent a default denomination", async t => {
  const { path, call, record } = await fixture(t);
  const emptyBytes = await readFile(path, "utf8");
  const empty = unpack(await call("monthly_summary", october));
  assert.equal(empty.currency, null);
  assert.deepEqual({ income: empty.incomeMinor, expense: empty.expenseMinor, net: empty.netMinor }, { income: 0, expense: 0, net: 0 });
  assert.deepEqual(empty.byCategory, {});
  assert.deepEqual(empty.budgets, []);
  const chosenEmpty = unpack(await call("monthly_summary", { ...october, currency: "JPY" }));
  assert.equal(chosenEmpty.currency, "JPY");
  assert.equal(chosenEmpty.expenseMinor, 0);
  assert.equal(await readFile(path, "utf8"), emptyBytes);
  await record();
  const before = await readFile(path, "utf8");
  const absent = unpack(await call("monthly_summary", { ...october, currency: "GBP" }));
  assert.equal(absent.currency, "GBP");
  assert.equal(absent.incomeMinor, 0);
  assert.equal(absent.expenseMinor, 0);
  assert.deepEqual(absent.byCategory, {});
  assert.equal(await readFile(path, "utf8"), before);
});

test("malformed selectors are refused even for empty months", async t => {
  const { path, call, record } = await fixture(t);
  await record();
  const before = await readFile(path, "utf8");
  for (const currency of [null, 12, true, {}, [], "", " ", "US", "USDD", "U$D"]) {
    for (const month of [10, 11]) {
      refused(await call("monthly_summary", { year: 2026, month, currency }), /currency/);
    }
  }
  assert.equal(await readFile(path, "utf8"), before);
});

test("a selector cannot assign an unqualified legacy budget to either currency", async t => {
  const { path, call, record } = await fixture(t);
  await record();
  await record({ amountMinor: 80, currency: "EUR", category: "travel" });
  // Even a budget whose category occurs in only one currency lacks a stored
  // denomination. The month-level policy does not infer one from its category.
  unpack(await call("set_budget", { category: "food", month: "2026-10", limitMinor: 600 }));
  const before = await readFile(path, "utf8");
  refused(await call("monthly_summary", october), /multiple currencies/);
  for (const currency of ["USD", "EUR", "JPY"]) {
    refused(await call("monthly_summary", { ...october, currency }), /budgets have no currency/);
  }
  assert.deepEqual(unpack(await call("get_budgets", { month: "2026-10" })), [{ category: "food", month: "2026-10", limitMinor: 600 }]);
  assert.equal(await readFile(path, "utf8"), before);
});

test("empty and differently selected budget contexts refuse instead of reporting a zero spend", async t => {
  const { path, call, record } = await fixture(t);
  unpack(await call("set_budget", { category: "food", month: "2026-10", limitMinor: 0 }));
  let before = await readFile(path, "utf8");
  refused(await call("monthly_summary", october), /budgets have no currency/);
  refused(await call("monthly_summary", { ...october, currency: "USD" }), /budgets have no currency/);
  assert.equal(await readFile(path, "utf8"), before);
  await record();
  before = await readFile(path, "utf8");
  refused(await call("monthly_summary", { ...october, currency: "EUR" }), /budgets have no currency/);
  const known = unpack(await call("monthly_summary", { ...october, currency: "USD" }));
  assert.equal(known.budgets[0].spentMinor, 500);
  assert.equal(known.budgets[0].remainingMinor, -500);
  assert.equal(known.budgets[0].over, true);
  assert.equal(await readFile(path, "utf8"), before);
});

test("budgets outside the requested month do not prevent an otherwise qualified selection", async t => {
  const { call, record } = await fixture(t);
  await record();
  await record({ currency: "EUR", amountMinor: 700 });
  unpack(await call("set_budget", { category: "food", month: "2026-09", limitMinor: 600 }));
  const selected = unpack(await call("monthly_summary", { ...october, currency: "USD" }));
  assert.equal(selected.currency, "USD");
  assert.equal(selected.expenseMinor, 500);
  assert.deepEqual(selected.budgets, []);
});

test("a later second currency invalidates the earlier implicit budget context for every receiver", async t => {
  const { path, connect, call, record } = await fixture(t);
  await record();
  unpack(await call("set_budget", { category: "food", month: "2026-10", limitMinor: 600 }));
  assert.equal(unpack(await call("monthly_summary", october)).currency, "USD");
  const other = await connect();
  unpack(await other.callTool({ name: "record_transaction", arguments: {
    type: "expense", amountMinor: 80, currency: "EUR", category: "food", date: "2026-10-08",
  } }));
  const before = await readFile(path, "utf8");
  refused(await call("monthly_summary", october), /multiple currencies/);
  refused(await call("monthly_summary", { ...october, currency: "USD" }), /budgets have no currency/);
  refused(await other.callTool({ name: "monthly_summary", arguments: { ...october, currency: "EUR" } }), /budgets have no currency/);
  assert.equal(await readFile(path, "utf8"), before);
});

test("income and expense aggregates refuse overflow even when each category amount is safe", async t => {
  const { path, call, record } = await fixture(t);
  for (const [type, month] of [["income", 10], ["expense", 11]] as const) {
    await record({ type, date: `2026-${month}-08`, category: "first", amountMinor: Number.MAX_SAFE_INTEGER });
    await record({ type, date: `2026-${month}-08`, category: "second", amountMinor: 2 });
    const before = await readFile(path, "utf8");
    refused(await call("monthly_summary", { year: 2026, month }), /safe integer range/);
    assert.equal(await readFile(path, "utf8"), before);
  }
});

test("safe boundaries and cancellation are exact but a small net cannot excuse unsafe gross totals", async t => {
  const { path, call, record } = await fixture(t);
  await record({ type: "income", amountMinor: Number.MAX_SAFE_INTEGER, category: "pay" });
  await record({ amountMinor: Number.MAX_SAFE_INTEGER, category: "food" });
  unpack(await call("set_budget", { category: "food", month: "2026-10", limitMinor: 0 }));
  const summary = unpack(await call("monthly_summary", october));
  assert.equal(summary.incomeMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(summary.expenseMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(summary.netMinor, 0);
  assert.equal(summary.budgets[0].remainingMinor, -Number.MAX_SAFE_INTEGER);
  assert.equal(Number.isSafeInteger(summary.byCategory.pay.incomeMinor), true);
  assert.equal(Number.isSafeInteger(summary.budgets[0].remainingMinor), true);
  await record({ type: "income", amountMinor: 1, category: "pay" });
  const before = await readFile(path, "utf8");
  refused(await call("monthly_summary", october), /safe integer range/);
  assert.equal(await readFile(path, "utf8"), before);
});

test("overflow in an unselected currency does not contaminate safe selected totals", async t => {
  const { call, record } = await fixture(t);
  await record({ amountMinor: 500 });
  await record({ currency: "EUR", amountMinor: Number.MAX_SAFE_INTEGER });
  await record({ currency: "EUR", amountMinor: 2 });
  const usd = unpack(await call("monthly_summary", { ...october, currency: "USD" }));
  assert.equal(usd.currency, "USD");
  assert.equal(usd.expenseMinor, 500);
  refused(await call("monthly_summary", { ...october, currency: "EUR" }), /safe integer range/);
});

test("accepted persisted currency spelling variants normalize for reading without rewriting the file", async t => {
  const { path, call, record } = await fixture(t);
  await record({ amountMinor: 500 });
  await record({ amountMinor: 300 });
  const data = JSON.parse(await readFile(path, "utf8"));
  data.transactions[0].currency = " usd ";
  data.transactions[1].currency = "uSd";
  const before = JSON.stringify(data);
  await writeFile(path, before, "utf8");
  const automatic = unpack(await call("monthly_summary", october));
  assert.equal(automatic.currency, "USD");
  assert.equal(automatic.expenseMinor, 800);
  assert.deepEqual(unpack(await call("monthly_summary", { ...october, currency: "USD" })), automatic);
  assert.equal(await readFile(path, "utf8"), before);
});
