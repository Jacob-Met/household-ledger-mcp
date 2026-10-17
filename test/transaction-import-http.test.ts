import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LedgerStore } from "../src/ledger.js";
import { type TransactionImportPreview, type commitTransactionImport } from "../src/transaction-import.js";

type ImportResult = Awaited<ReturnType<typeof commitTransactionImport>>;
type ToolReply = { isError?: boolean; content: Array<{ type: string; text?: string }> };
const HEADER = "idempotencyKey,type,amountMinor,currency,date,category,note\n";
const sourceFor = (...keys: string[]): string => HEADER + keys.map(key => `${key},expense,125,usd,2026-10-01, food ,`).join("\n");
function payload<T>(value: unknown): T {
  const reply = value as ToolReply;
  assert.equal(reply.isError, undefined, JSON.stringify(reply));
  assert.equal(reply.content[0].type, "text");
  return JSON.parse(reply.content[0].text!) as T;
}
function failure(value: unknown, pattern: RegExp): void {
  const reply = value as ToolReply;
  assert.equal(reply.isError, true, JSON.stringify(reply));
  assert.match(reply.content[0].text!, pattern);
}

async function launch(path: string): Promise<{ client: Client; stop: () => Promise<void> }> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    env: { ...process.env, HOUSEHOLD_LEDGER_DATA_PATH: path, HOUSEHOLD_LEDGER_HOST: "127.0.0.1", HOUSEHOLD_LEDGER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  child.stderr.on("data", chunk => { errors += String(chunk); });
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error(`private import server startup timed out: ${errors}`)), 5000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`private import server exited ${code}: ${errors}`)); });
      child.stdout.on("data", chunk => {
        output += String(chunk);
        if (output.includes("listening on")) { clearTimeout(timer); resolve(); }
      });
    });
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    const client = new Client({ name: "import-http-receiving", version: "1" }, { capabilities: {} });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    return { client, stop: async () => {
      await client.close();
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGTERM");
        await exit;
      }
      assert.equal(errors, "", `private import server errors: ${errors}`);
    } };
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

test("real HTTP import previews exact values, records the batch once and preserves identities across restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hlm-http-import-"));
  const path = join(dir, "ledger.json");
  let service: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    service = await launch(path);
    const names = (await service.client.listTools()).tools.map(tool => tool.name).sort();
    assert.deepEqual(names, ["cashflow_trend", "commit_transaction_import", "get_budgets", "list_transactions", "monthly_summary", "preview_transaction_import", "record_transaction", "set_budget"]);
    const csv = HEADER + 'bank:one,income,02000, usd ,2026-10-01, salary ,"  payer, \"\"October\"\"\r\npaid  "\n' +
      "bank:two,expense,500,USD,2026-10-02,food,\n" + "bank:three,expense,75,EUR,2026-10-02,food,";
    const preview = payload<TransactionImportPreview>(await service.client.callTool({ name: "preview_transaction_import", arguments: { csv } }));
    assert.equal(preview.canCommit, true);
    assert.equal(preview.rows[0].input.amountMinor, 2000);
    assert.equal(preview.rows[0].input.currency, "USD");
    assert.equal(preview.rows[0].input.category, "salary");
    assert.equal(preview.rows[0].input.note, '  payer, "October"\r\npaid  ');
    await assert.rejects(readFile(path), { code: "ENOENT" });
    const args = { csv, reviewToken: preview.reviewToken };
    const first = payload<ImportResult>(await service.client.callTool({ name: "commit_transaction_import", arguments: args }));
    assert.equal(first.added, 3);
    assert.deepEqual(first.totals, preview.totals.additions);
    for (let i = 0; i < first.transactions.length; i++) {
      const { id, createdAt, ...input } = first.transactions[i];
      assert.ok(id && createdAt);
      assert.deepEqual(input, preview.rows[i].input);
    }
    assert.deepEqual((await new LedgerStore(path).load()).transactions, first.transactions);
    const monthly = payload<{ incomeMinor: number; expenseMinor: number; netMinor: number }>(await service.client.callTool({ name: "monthly_summary", arguments: { year: 2026, month: 10, currency: "USD" } }));
    assert.deepEqual([monthly.incomeMinor, monthly.expenseMinor, monthly.netMinor], [2000, 500, 1500]);
    const bytes = await readFile(path), before = await stat(path);
    await service.stop();
    service = undefined;
    service = await launch(path);
    const replay = payload<ImportResult>(await service.client.callTool({ name: "commit_transaction_import", arguments: args }));
    assert.equal(replay.added, 0);
    assert.equal(replay.alreadyRecorded, 3);
    assert.deepEqual(replay.transactions, first.transactions);
    assert.deepEqual(replay.totals, []);
    assert.deepEqual(await readFile(path), bytes);
    assert.equal((await stat(path)).mtimeMs, before.mtimeMs);
  } finally {
    await service?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("real HTTP commit rechecks current native keys and refuses conflicting or unreviewed batches without partial data", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hlm-http-import-conflict-"));
  const path = join(dir, "ledger.json");
  let service: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    service = await launch(path);
    const csv = sourceFor("first-addition", "conflicting-last");
    const preview = payload<TransactionImportPreview>(await service.client.callTool({ name: "preview_transaction_import", arguments: { csv } }));
    payload(await service.client.callTool({ name: "record_transaction", arguments: { idempotencyKey: "conflicting-last", type: "expense", amountMinor: 999, currency: "USD", date: "2026-10-01", category: "food", note: "" } }));
    payload(await service.client.callTool({ name: "set_budget", arguments: { category: "food", month: "2026-10", limitMinor: 5000, currency: "USD" } }));
    const bytes = await readFile(path);
    failure(await service.client.callTool({ name: "commit_transaction_import", arguments: { csv, reviewToken: preview.reviewToken } }), /no rows were saved/);
    assert.deepEqual(await readFile(path), bytes);
    const refreshed = payload<TransactionImportPreview>(await service.client.callTool({ name: "preview_transaction_import", arguments: { csv } }));
    assert.equal(refreshed.canCommit, false);
    assert.equal(refreshed.reviewToken, null);
    assert.equal(refreshed.rows[1].existingTransaction?.amountMinor, 999);
    failure(await service.client.callTool({ name: "commit_transaction_import", arguments: { csv: csv + "\n", reviewToken: preview.reviewToken } }), /reviewToken/);
    failure(await service.client.callTool({ name: "preview_transaction_import", arguments: { csv: sourceFor("good", "bad").replace("bad,expense,125", "bad,expense,1.5") } }), /CSV line 3/);
    failure(await service.client.callTool({ name: "preview_transaction_import", arguments: { csv, overwrite: true } }), /unsupported/);
    assert.deepEqual(await readFile(path), bytes);
    assert.equal((await new LedgerStore(path).load()).transactions.length, 1);
  } finally {
    await service?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("real HTTP overlapping imports compose with concurrent native recording and denominated budget writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hlm-http-import-concurrent-"));
  const path = join(dir, "ledger.json");
  let service: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    service = await launch(path);
    const client = service.client;
    const firstCsv = sourceFor("one", "shared"), secondCsv = sourceFor("shared", "two");
    const firstPreview = payload<TransactionImportPreview>(await client.callTool({ name: "preview_transaction_import", arguments: { csv: firstCsv } }));
    const secondPreview = payload<TransactionImportPreview>(await client.callTool({ name: "preview_transaction_import", arguments: { csv: secondCsv } }));
    const outcomes = await Promise.all([
      client.callTool({ name: "commit_transaction_import", arguments: { csv: firstCsv, reviewToken: firstPreview.reviewToken } }),
      client.callTool({ name: "commit_transaction_import", arguments: { csv: secondCsv, reviewToken: secondPreview.reviewToken } }),
      client.callTool({ name: "record_transaction", arguments: { idempotencyKey: "ordinary", type: "expense", amountMinor: 17, currency: "USD", date: "2026-10-01", category: "food" } }),
      client.callTool({ name: "set_budget", arguments: { category: "food", month: "2026-10", limitMinor: 1000, currency: "USD" } }),
    ]);
    const first = payload<ImportResult>(outcomes[0]), second = payload<ImportResult>(outcomes[1]);
    payload(outcomes[2]); payload(outcomes[3]);
    assert.equal(first.added + second.added, 3);
    assert.equal(first.alreadyRecorded + second.alreadyRecorded, 1);
    assert.deepEqual(first.transactions.find(tx => tx.idempotencyKey === "shared"), second.transactions.find(tx => tx.idempotencyKey === "shared"));
    const data = await new LedgerStore(path).load();
    assert.equal(data.transactions.length, 4);
    assert.equal(new Set(data.transactions.map(tx => tx.idempotencyKey)).size, 4);
    assert.equal(data.version, 2);
    assert.equal(data.budgets[0].currency, "USD");
    assert.equal(data.budgets[0].limitMinor, 1000);
    const summary = payload<{ expenseMinor: number }>(await client.callTool({ name: "monthly_summary", arguments: { year: 2026, month: 10, currency: "USD" } }));
    assert.equal(summary.expenseMinor, 392);
  } finally {
    await service?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
