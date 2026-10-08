import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Exercise the actual process entrypoint and Streamable HTTP receiver. Every
// fixture is confined to this isolated checkout and uses fictional records.
async function fixture(t: TestContext) {
  const runtimeRoot = fileURLToPath(new URL("../../.qualification-runtime/", import.meta.url));
  await mkdir(runtimeRoot, { recursive: true });
  const directory = await mkdtemp(join(runtimeRoot, "category-composition-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, "ledger.json");
}

async function launch(path: string) {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    env: { ...process.env, HOUSEHOLD_LEDGER_DATA_PATH: path,
      HOUSEHOLD_LEDGER_HOST: "127.0.0.1", HOUSEHOLD_LEDGER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  let stdout = "";
  child.stderr.on("data", data => { stderr += String(data); });
  const clients: Client[] = [];
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.allSettled(clients.map(client => client.close()));
    if (child.exitCode === null && child.signalCode === null) {
      const done = once(child, "exit");
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), 3000);
      try { await done; } finally { clearTimeout(force); }
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`startup timeout: ${stderr}`)), 5000);
      child.once("error", error => { clearTimeout(timeout); reject(error); });
      child.once("exit", code => { clearTimeout(timeout); reject(new Error(`early exit ${code}: ${stderr}`)); });
      child.stdout.on("data", data => {
        stdout += String(data);
        if (stdout.includes("listening on")) { clearTimeout(timeout); resolve(); }
      });
    });
    for (let i = 0; i < 3; i++) {
      const client = new Client({ name: `category-composition-receiver-${i}`, version: "1" }, { capabilities: {} });
      clients.push(client);
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    }
    return { clients, close };
  } catch (error) {
    await close();
    throw error;
  }
}

function unpack(value: unknown): any {
  const result = value as { isError?: boolean; content: Array<{ type: string; text: string }> };
  assert.notEqual(result.isError, true, result.content[0]?.text);
  assert.equal(result.content[0]?.type, "text");
  return JSON.parse(result.content[0].text);
}

for (const category of ["__proto__", "constructor", "toString", "groceries"]) {
  test(`HTTP receiving composition retains concurrent ${JSON.stringify(category)} recordings, exact summary and restart retries`,
    { timeout: 20000 }, async t => {
      const path = await fixture(t);
      const http = await launch(path);
      t.after(http.close);
      const input = { type: "expense", amountMinor: 751, currency: "USD", date: "2026-10-08",
        category, idempotencyKey: "first-purchase", note: "fictional independent receiving record" };
      const mutations = Array.from({ length: 16 }, (_, i) => http.clients[i % 3].callTool({
        name: "record_transaction", arguments: { ...input, amountMinor: i % 2 ? 249 : 751,
          idempotencyKey: i % 2 ? "second-purchase" : "first-purchase" },
      }));
      const other = [
        http.clients[0].callTool({ name: "record_transaction", arguments: {
          ...input, type: "income", amountMinor: 1000, idempotencyKey: "income" } }),
        http.clients[1].callTool({ name: "record_transaction", arguments: {
          ...input, amountMinor: 990, date: "2026-09-30", idempotencyKey: "prior-month" } }),
        http.clients[2].callTool({ name: "record_transaction", arguments: {
          ...input, category: "ordinary-unrelated", amountMinor: 73, idempotencyKey: "unrelated" } }),
        http.clients[0].callTool({ name: "set_budget", arguments: { category, month: "2026-10", limitMinor: 900 } }),
        http.clients[1].callTool({ name: "set_budget", arguments: { category: "__defineGetter__", month: "2026-10", limitMinor: 400 } }),
        http.clients[2].callTool({ name: "set_budget", arguments: { category, month: "2026-11", limitMinor: 5000 } }),
      ];
      const recordings = (await Promise.all(mutations)).map(unpack);
      for (const result of await Promise.all(other)) unpack(result);
      assert.equal(new Set(recordings.filter((_, i) => i % 2 === 0).map(row => row.id)).size, 1);
      assert.equal(new Set(recordings.filter((_, i) => i % 2 === 1).map(row => row.id)).size, 1);
      assert.notEqual(recordings[0].id, recordings[1].id);
      const before = await readFile(path, "utf8");
      const stored = JSON.parse(before);
      assert.equal(stored.transactions.length, 5);
      assert.equal(stored.budgets.length, 3);
      const listed = unpack(await http.clients[0].callTool({ name: "list_transactions", arguments: { category } }));
      assert.equal(listed.total, 4);
      assert.ok(listed.transactions.every((row: any) => row.category === category));

      const expectedCategories = JSON.parse(JSON.stringify(Object.fromEntries([
        [category, { incomeMinor: 1000, expenseMinor: 1000 }],
        ["ordinary-unrelated", { incomeMinor: 0, expenseMinor: 73 }],
      ])));
      let acceptedSummary: any;
      for (let i = 0; i < 2; i++) {
        const summary = unpack(await http.clients[i].callTool({ name: "monthly_summary", arguments: { year: 2026, month: 10 } }));
        assert.deepEqual(summary.byCategory, expectedCategories);
        assert.equal(summary.incomeMinor, 1000);
        assert.equal(summary.expenseMinor, 1073);
        assert.equal(summary.netMinor, -73);
        assert.deepEqual(summary.budgets.find((budget: any) => budget.category === category),
          { category, limitMinor: 900, spentMinor: 1000, remainingMinor: -100, over: true });
        assert.deepEqual(summary.budgets.find((budget: any) => budget.category === "__defineGetter__"),
          { category: "__defineGetter__", limitMinor: 400, spentMinor: 0, remainingMinor: 400, over: false });
        assert.equal(summary.budgets.length, 2);
        assert.equal(await readFile(path, "utf8"), before);
        acceptedSummary = summary;
      }
      const retry = unpack(await http.clients[1].callTool({ name: "record_transaction", arguments: {
        ...input, category: ` ${category} `, currency: " usd " } }));
      assert.deepEqual(retry, recordings[0]);
      const conflict = await http.clients[2].callTool({ name: "record_transaction", arguments: { ...input, amountMinor: 752 } });
      assert.equal(conflict.isError, true);
      assert.equal(await readFile(path, "utf8"), before);

      await http.close();
      const restarted = await launch(path);
      t.after(restarted.close);
      const replay = unpack(await restarted.clients[0].callTool({ name: "record_transaction", arguments: input }));
      assert.deepEqual(replay, recordings[0]);
      assert.deepEqual(unpack(await restarted.clients[1].callTool({ name: "monthly_summary", arguments: { year: 2026, month: 10 } })), acceptedSummary);
      assert.equal(await readFile(path, "utf8"), before);
    });
}
