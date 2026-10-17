import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/index.js";
import { emptyLedger, LedgerStore, validateLedgerData } from "../src/ledger.js";

const october = { year: 2026, month: 10 };
const budget = { category: "food", month: "2026-10", limitMinor: 1000 };
type Result = { isError?: boolean; content: Array<{ text: string }> };

function unpack(result: unknown): any {
  const value = result as Result;
  assert.notEqual(value.isError, true, value.content[0]?.text);
  return JSON.parse(value.content[0].text);
}

function refused(result: unknown, message: RegExp): void {
  const value = result as Result;
  assert.equal(value.isError, true, JSON.stringify(value));
  assert.match(value.content[0].text, message);
}

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "ledger-budget-currency-"));
  const path = join(dir, "ledger.json");
  await new LedgerStore(path).save(emptyLedger());
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
    const client = new Client({ name: "denominated-budget-receiver", version: "1" }, { capabilities: {} });
    await client.connect(clientTransport);
    clients.push(client);
    servers.push(server);
    return client;
  };
  const client = await connect();
  const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args }, undefined, { timeout: 3000 });
  const record = async (args: Record<string, unknown> = {}) => unpack(await call("record_transaction", {
    type: "expense", amountMinor: 700, currency: "USD", category: "food", date: "2026-10-08", ...args,
  }));
  return { path, client, connect, call, record };
}

test("one category can have separately denominated limits and selected spending through MCP", async t => {
  const { path, call, record } = await fixture(t);
  const usdRecord = await record({ idempotencyKey: "unchanged-purchase" });
  await record({ currency: "EUR", amountMinor: 350 });
  assert.deepEqual(unpack(await call("set_budget", { ...budget, currency: " usd " })), { ...budget, currency: "USD" });
  unpack(await call("set_budget", { ...budget, limitMinor: 300, currency: "EUR" }));
  const usd = unpack(await call("monthly_summary", { ...october, currency: "USD" }));
  const eur = unpack(await call("monthly_summary", { ...october, currency: "eur" }));
  assert.equal(usd.expenseMinor, 700);
  assert.deepEqual(usd.budgets, [{ category: "food", currency: "USD", limitMinor: 1000, spentMinor: 700, remainingMinor: 300, over: false }]);
  assert.equal(eur.expenseMinor, 350);
  assert.deepEqual(eur.budgets, [{ category: "food", currency: "EUR", limitMinor: 300, spentMinor: 350, remainingMinor: -50, over: true }]);
  const saved = JSON.parse(await readFile(path, "utf8"));
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.transactions[0], usdRecord);
  assert.equal(saved.budgets.length, 2);
});

test("set/get schemas expose currency, unassigned replacement is explicit, and old required inputs remain", async t => {
  const { client } = await fixture(t);
  const tools = (await client.listTools()).tools;
  const set = tools.find(tool => tool.name === "set_budget")!;
  const get = tools.find(tool => tool.name === "get_budgets")!;
  assert.equal((set.inputSchema.properties?.currency as any)?.type, "string");
  assert.equal((set.inputSchema.properties?.replaceUnassigned as any)?.type, "boolean");
  assert.deepEqual(set.inputSchema.required, ["category", "month", "limitMinor"]);
  assert.equal((get.inputSchema.properties?.currency as any)?.type, "string");
});

test("planning an unspent month uses only explicitly stored denominations", async t => {
  const { path, call } = await fixture(t);
  unpack(await call("set_budget", { ...budget, currency: "JPY", limitMinor: 12000 }));
  const before = await readFile(path, "utf8");
  const summary = unpack(await call("monthly_summary", october));
  assert.equal(summary.currency, "JPY");
  assert.equal(summary.expenseMinor, 0);
  assert.deepEqual(summary.budgets, [{ category: "food", currency: "JPY", limitMinor: 12000, spentMinor: 0, remainingMinor: 12000, over: false }]);
  assert.equal(await readFile(path, "utf8"), before);
  unpack(await call("set_budget", { ...budget, currency: "USD", limitMinor: 0 }));
  refused(await call("monthly_summary", october), /multiple currencies.*supply currency/);
  const selected = unpack(await call("monthly_summary", { ...october, currency: "USD" }));
  assert.deepEqual(selected.budgets, [{ category: "food", currency: "USD", limitMinor: 0, spentMinor: 0, remainingMinor: 0, over: false }]);
  assert.deepEqual(unpack(await call("monthly_summary", { ...october, currency: "EUR" })).budgets, []);
});

test("a budget in another currency cannot be hidden by automatic transaction-currency selection", async t => {
  const { call, record } = await fixture(t);
  await record();
  unpack(await call("set_budget", { ...budget, currency: "EUR" }));
  refused(await call("monthly_summary", october), /multiple currencies \(EUR, USD\).*supply currency/);
  assert.equal(unpack(await call("monthly_summary", { ...october, currency: "EUR" })).budgets[0].spentMinor, 0);
  assert.deepEqual(unpack(await call("monthly_summary", { ...october, currency: "USD" })).budgets, []);
});

test("assigning a legacy budget requires explicit replacement and preserves all unrelated source data", async t => {
  const { path, call, record } = await fixture(t);
  const original = await record();
  unpack(await call("set_budget", budget));
  unpack(await call("set_budget", { category: "travel", month: "2026-11", limitMinor: 2500 }));
  const before = await readFile(path, "utf8");
  assert.equal(JSON.parse(before).version, 1);
  refused(await call("set_budget", { ...budget, currency: "USD" }), /replaceUnassigned/);
  refused(await call("set_budget", { ...budget, replaceUnassigned: true }), /currency/);
  assert.equal(await readFile(path, "utf8"), before);
  const explicit = { ...budget, limitMinor: 900, currency: "USD", replaceUnassigned: true };
  assert.deepEqual(unpack(await call("set_budget", explicit)), { ...budget, limitMinor: 900, currency: "USD" });
  const migrated = await readFile(path, "utf8");
  const saved = JSON.parse(migrated);
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.transactions, [original]);
  assert.deepEqual(saved.budgets[1], { category: "travel", month: "2026-11", limitMinor: 2500 });
  assert.deepEqual(unpack(await call("set_budget", explicit)), saved.budgets[0]);
  assert.equal(await readFile(path, "utf8"), migrated, "exact replacement retry must not rewrite the ledger");
  refused(await call("set_budget", { ...budget, limitMinor: 800 }), /currency/);
  assert.equal(await readFile(path, "utf8"), migrated);
});

test("each unresolved legacy budget remains visible and blocks ambiguous comparisons after a partial migration", async t => {
  const { path, call, record } = await fixture(t);
  await record();
  await record({ currency: "EUR", amountMinor: 120 });
  unpack(await call("set_budget", budget));
  unpack(await call("set_budget", { ...budget, category: "travel", limitMinor: 400 }));
  unpack(await call("set_budget", { ...budget, currency: "USD", replaceUnassigned: true }));
  const before = await readFile(path, "utf8");
  assert.deepEqual(unpack(await call("get_budgets", { month: "2026-10" })), [
    { ...budget, currency: "USD" }, { ...budget, category: "travel", limitMinor: 400 },
  ]);
  refused(await call("monthly_summary", { ...october, currency: "USD" }), /budgets have no currency/);
  assert.equal(await readFile(path, "utf8"), before);
  unpack(await call("set_budget", { ...budget, category: "travel", limitMinor: 400, currency: "EUR", replaceUnassigned: true }));
  assert.equal(unpack(await call("monthly_summary", { ...october, currency: "USD" })).budgets.length, 1);
  assert.equal(unpack(await call("monthly_summary", { ...october, currency: "EUR" })).budgets[0].category, "travel");
});

test("currency-scoped updates and reads retain the other denomination and never silently assign unqualified budgets", async t => {
  const { path, call } = await fixture(t);
  unpack(await call("set_budget", { ...budget, currency: "USD" }));
  unpack(await call("set_budget", { ...budget, limitMinor: 500, currency: "EUR" }));
  unpack(await call("set_budget", { ...budget, category: "unassigned" }));
  unpack(await call("set_budget", { ...budget, limitMinor: 950, currency: "usd" }));
  const before = await readFile(path, "utf8");
  assert.deepEqual(unpack(await call("get_budgets", { month: "2026-10", currency: " eur " })), [{ ...budget, limitMinor: 500, currency: "EUR" }]);
  assert.equal(unpack(await call("get_budgets", { month: "2026-10" })).length, 3);
  assert.deepEqual(unpack(await call("get_budgets", { month: "2026-10", currency: "JPY" })), []);
  assert.deepEqual(unpack(await call("get_budgets", { month: "2026-11", currency: "USD" })), []);
  assert.equal(await readFile(path, "utf8"), before);
});

test("invalid denomination and replacement inputs cannot migrate or mutate a legacy file", async t => {
  const { path, call } = await fixture(t);
  unpack(await call("set_budget", budget));
  const before = await readFile(path, "utf8");
  for (const currency of [null, false, 12, {}, [], "", "US", "USDD", "U$D"]) {
    refused(await call("set_budget", { ...budget, currency, replaceUnassigned: true }), /currency/);
    refused(await call("get_budgets", { month: "2026-10", currency }), /currency/);
  }
  for (const replaceUnassigned of [null, 1, "true", [], {}]) {
    refused(await call("set_budget", { ...budget, currency: "USD", replaceUnassigned }), /replaceUnassigned/);
  }
  refused(await call("set_budget", { ...budget, currency: "USD", replaceUnassigned: true, limitMinor: Number.MAX_SAFE_INTEGER + 1 }), /limitMinor/);
  assert.equal(await readFile(path, "utf8"), before);
});

test("reserved categories and safe integer boundaries remain exact for a selected denominated budget", async t => {
  const { call, record } = await fixture(t);
  await record({ category: "__proto__", amountMinor: Number.MAX_SAFE_INTEGER });
  await record({ currency: "EUR", amountMinor: Number.MAX_SAFE_INTEGER });
  await record({ currency: "EUR", amountMinor: 1 });
  unpack(await call("set_budget", { ...budget, category: "__proto__", currency: "USD", limitMinor: 0 }));
  const usd = unpack(await call("monthly_summary", { ...october, currency: "USD" }));
  assert.equal(usd.byCategory.__proto__.expenseMinor, Number.MAX_SAFE_INTEGER);
  assert.equal(usd.budgets[0].remainingMinor, -Number.MAX_SAFE_INTEGER);
  assert.equal(usd.budgets[0].over, true);
  refused(await call("monthly_summary", { ...october, currency: "EUR" }), /safe integer range/);
});

test("v1 reads stay byte-exact and explicit currency records require the version understood by the new reader", async t => {
  const { path, call } = await fixture(t);
  const original = { version: 1, transactions: [], budgets: [{ ...budget }], retainedExtension: { source: "legacy" } };
  const bytes = JSON.stringify(original);
  await writeFile(path, bytes, "utf8");
  assert.deepEqual(unpack(await call("get_budgets", { month: "2026-10" })), [budget]);
  refused(await call("monthly_summary", october), /budgets have no currency/);
  assert.equal(await readFile(path, "utf8"), bytes);
  unpack(await call("set_budget", { ...budget, currency: "USD", replaceUnassigned: true }));
  const changed = JSON.parse(await readFile(path, "utf8"));
  assert.equal(changed.version, 2);
  assert.deepEqual(changed.retainedExtension, original.retainedExtension);
  assert.deepEqual(validateLedgerData(changed), changed);
  assert.throws(() => validateLedgerData({ ...changed, version: 1 }), /version 2/);
});

test("malformed v2 budget identities are refused without repairing or replacing the source file", async t => {
  const { path, call } = await fixture(t);
  const variants = [
    [{ ...budget, currency: "US" }],
    [{ ...budget, currency: "USD" }, { ...budget, currency: "USD" }],
    [{ ...budget }, { ...budget, currency: "USD" }],
    [null],
  ];
  for (const budgets of variants) {
    const bytes = JSON.stringify({ version: 2, transactions: [], budgets });
    await writeFile(path, bytes, "utf8");
    refused(await call("get_budgets", { month: "2026-10" }), /budget|currency/);
    refused(await call("set_budget", { ...budget, currency: "EUR" }), /budget|currency/);
    assert.equal(await readFile(path, "utf8"), bytes);
  }
});
