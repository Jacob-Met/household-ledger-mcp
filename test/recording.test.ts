import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/index.js";
import { LedgerStore, emptyLedger, type LedgerData } from "../src/ledger.js";

const purchase = {
  type: "expense", amountMinor: 1250, currency: "USD", date: "2026-10-08", category: "groceries",
};

async function connect(t: TestContext, store: LedgerStore) {
  const server = createMcpServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "recording-receiver", version: "1" }, { capabilities: {} });
  await client.connect(clientTransport);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

async function fixture(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "ledger-recording-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "ledger.json");
  const store = new LedgerStore(path);
  await store.save(emptyLedger());
  return { path, store, client: await connect(t, store) };
}

function unpack(result: unknown): any {
  const r = result as { isError?: boolean; content: Array<{ type: string; text: string }> };
  assert.notEqual(r.isError, true, r.content[0]?.text);
  assert.equal(r.content[0].type, "text");
  return JSON.parse(r.content[0].text);
}

test("native MCP concurrent transaction and budget writes retain every successful mutation", async (t) => {
  const { path, client } = await fixture(t);
  // The HTTP server creates multiple MCP servers over shared storage; also
  // qualify separate store objects addressing the same file in one process.
  const second = await connect(t, new LedgerStore(path));
  const calls = Array.from({ length: 32 }, (_, i) => (i % 2 ? client : second).callTool({
    name: i % 4 === 0 ? "set_budget" : "record_transaction",
    arguments: i % 4 === 0
      ? { category: `budget-${i}`, month: "2026-10", limitMinor: 5000 }
      : { ...purchase, note: `receipt-${i}` },
  }));
  const returned = await Promise.all(calls);
  for (const result of returned) unpack(result);
  const stored = await new LedgerStore(path).load();
  assert.equal(stored.transactions.length, 24);
  assert.equal(stored.budgets.length, 8);
  assert.equal(new Set(stored.transactions.map(tx => tx.id)).size, 24);
});

test("a retried MCP recording returns its persisted identity across a new receiver", async (t) => {
  const { path, client } = await fixture(t);
  const args = { ...purchase, idempotencyKey: "receipt-20261008-001" };
  const first = unpack(await client.callTool({ name: "record_transaction", arguments: args }));
  const before = await readFile(path, "utf8");
  const reopened = await connect(t, new LedgerStore(path));
  const repeated = unpack(await reopened.callTool({ name: "record_transaction", arguments: {
    ...args, currency: "usd", category: " groceries ",
  } }));
  assert.deepEqual(repeated, first);
  assert.equal((await new LedgerStore(path).load()).transactions.length, 1);
  assert.equal(await readFile(path, "utf8"), before);
});

test("concurrent copies of one idempotency key produce one record", async (t) => {
  const { path, client } = await fixture(t);
  const results = await Promise.all(Array.from({ length: 16 }, () => client.callTool({
    name: "record_transaction", arguments: { ...purchase, idempotencyKey: "one-logical-purchase" },
  })));
  const ids = results.map(r => unpack(r).id);
  assert.equal(new Set(ids).size, 1);
  assert.equal((await new LedgerStore(path).load()).transactions.length, 1);
});

test("an existing key refuses changed input without altering stored bytes", async (t) => {
  const { path, client } = await fixture(t);
  const args = { ...purchase, idempotencyKey: "bound-input" };
  unpack(await client.callTool({ name: "record_transaction", arguments: args }));
  const before = await readFile(path, "utf8");
  for (const change of [
    { amountMinor: 1251 }, { currency: "EUR" }, { type: "income" },
    { date: "2026-10-09" }, { category: "travel" }, { note: "" },
  ]) {
    const result = await client.callTool({ name: "record_transaction", arguments: { ...args, ...change } });
    assert.equal(result.isError, true, JSON.stringify(change));
    assert.equal(await readFile(path, "utf8"), before);
  }
});

test("unkeyed recordings remain independent and malformed keys do not write", async (t) => {
  const { path, client } = await fixture(t);
  const first = unpack(await client.callTool({ name: "record_transaction", arguments: purchase }));
  const second = unpack(await client.callTool({ name: "record_transaction", arguments: purchase }));
  assert.notEqual(first.id, second.id);
  const before = await readFile(path, "utf8");
  for (const idempotencyKey of [null, 12, "", " ", "x".repeat(129)]) {
    const result = await client.callTool({ name: "record_transaction", arguments: { ...purchase, idempotencyKey } });
    assert.equal(result.isError, true, JSON.stringify(idempotencyKey));
    assert.equal(await readFile(path, "utf8"), before);
  }
});

test("failed persistence releases the mutation queue and retry keeps the correct outcome", async (t) => {
  const { path, store } = await fixture(t);
  class FailingOnceStore extends LedgerStore {
    failNext = true;
    override async save(data: LedgerData): Promise<void> {
      if (this.failNext) { this.failNext = false; throw new Error("authored persistence refusal"); }
      await super.save(data);
    }
  }
  const failing = await connect(t, new FailingOnceStore(path));
  const args = { ...purchase, idempotencyKey: "retry-after-refusal" };
  const refused = await failing.callTool({ name: "record_transaction", arguments: args });
  assert.equal(refused.isError, true);
  assert.equal((await store.load()).transactions.length, 0);
  const accepted = unpack(await failing.callTool({ name: "record_transaction", arguments: args }));
  const repeated = unpack(await failing.callTool({ name: "record_transaction", arguments: args }));
  assert.deepEqual(repeated, accepted);
  assert.equal((await store.load()).transactions.length, 1);
});

test("an uncertain post-save response is recoverable using the original key", async (t) => {
  const { path, store } = await fixture(t);
  class UncertainStore extends LedgerStore {
    failNext = true;
    override async save(data: LedgerData): Promise<void> {
      await super.save(data);
      if (this.failNext) { this.failNext = false; throw new Error("authored lost save acknowledgment"); }
    }
  }
  const client = await connect(t, new UncertainStore(path));
  const args = { ...purchase, idempotencyKey: "persisted-but-unacknowledged" };
  const uncertain = await client.callTool({ name: "record_transaction", arguments: args });
  assert.equal(uncertain.isError, true);
  const persisted = (await store.load()).transactions[0];
  assert.ok(persisted);
  const before = await readFile(path, "utf8");
  assert.deepEqual(unpack(await client.callTool({ name: "record_transaction", arguments: args })), persisted);
  assert.equal(await readFile(path, "utf8"), before);
});

test("ledger validation refuses ambiguous or malformed persisted request keys", async (t) => {
  const { path, client } = await fixture(t);
  const args = { ...purchase, idempotencyKey: "stored-key" };
  unpack(await client.callTool({ name: "record_transaction", arguments: args }));
  const data = JSON.parse(await readFile(path, "utf8"));
  for (const malformed of [
    { ...data, transactions: [...data.transactions, { ...data.transactions[0], id: "another" }] },
    { ...data, transactions: [{ ...data.transactions[0], idempotencyKey: 15 }] },
    { ...data, transactions: [{ ...data.transactions[0], note: {} }] },
    { ...data, transactions: [null] },
  ]) {
    const bytes = JSON.stringify(malformed);
    await writeFile(path, bytes, "utf8");
    const result = await client.callTool({ name: "record_transaction", arguments: { ...purchase, idempotencyKey: "new-key" } });
    assert.equal(result.isError, true);
    assert.equal(await readFile(path, "utf8"), bytes);
  }
});

test("request-key schema and runtime count Unicode characters consistently", async (t) => {
  const { path, client } = await fixture(t);
  const idempotencyKey = "🧾".repeat(128);
  const result = unpack(await client.callTool({ name: "record_transaction", arguments: { ...purchase, idempotencyKey } }));
  assert.equal(result.idempotencyKey, idempotencyKey);
  const before = await readFile(path, "utf8");
  assert.equal((await client.callTool({ name: "record_transaction", arguments: { ...purchase, idempotencyKey: idempotencyKey + "🧾" } })).isError, true);
  assert.equal(await readFile(path, "utf8"), before);
});

test("atomic snapshot refusal cleans up its own temporary file and can recover", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-save-refusal-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, "ledger.json");
  await mkdir(path);
  const store = new LedgerStore(path);
  await assert.rejects(store.save(emptyLedger()));
  assert.deepEqual(await readdir(dir), ["ledger.json"]);
  await rm(path, { recursive: true });
  await store.save(emptyLedger());
  assert.deepEqual(await store.load(), emptyLedger());
  assert.deepEqual(await readdir(dir), ["ledger.json"]);
});
