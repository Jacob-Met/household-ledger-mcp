import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function launch(path: string) {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    env: { ...process.env, HOUSEHOLD_LEDGER_DATA_PATH: path, HOUSEHOLD_LEDGER_HOST: "127.0.0.1", HOUSEHOLD_LEDGER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostic = "";
  child.stderr.on("data", chunk => { diagnostic += String(chunk); });
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timed out: ${diagnostic}`)), 5000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${diagnostic}`)); });
      child.stdout.on("data", chunk => {
        if (String(chunk).includes("listening on")) { clearTimeout(timer); resolve(); }
      });
    });
    const client = new Client({ name: "http-currency-receiver", version: "1" }, { capabilities: {} });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    return { client, stop: async () => { try { await client.close(); } finally { await stop(); } } };
  } catch (error) {
    await stop();
    throw error;
  }
}

function unpack(result: unknown): any {
  const value = result as { isError?: boolean; content: Array<{ text: string }> };
  assert.notEqual(value.isError, true, value.content[0]?.text);
  return JSON.parse(value.content[0].text);
}

test("fresh HTTP processes preserve selected units and refuse ambiguous legacy budgets", { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-http-summary-"));
  const path = join(dir, "ledger.json");
  let server: Awaited<ReturnType<typeof launch>> | undefined;
  const originalInput = { type: "expense", amountMinor: 1250, currency: "USD", category: "food", date: "2026-10-08", idempotencyKey: "usd-purchase" };
  try {
    server = await launch(path);
    const original = unpack(await server.client.callTool({ name: "record_transaction", arguments: originalInput }));
    unpack(await server.client.callTool({ name: "record_transaction", arguments: {
      ...originalInput, amountMinor: 990, currency: "EUR", idempotencyKey: "eur-purchase",
    } }));
    assert.equal((await server.client.callTool({ name: "monthly_summary", arguments: { year: 2026, month: 10 } })).isError, true);
    await server.stop();
    server = undefined;
    server = await launch(path);
    const tool = (await server.client.listTools()).tools.find(value => value.name === "monthly_summary");
    assert.ok(tool?.inputSchema.properties?.currency);
    const before = await readFile(path, "utf8");
    const [usd, eur] = (await Promise.all([" usd ", "EUR"].map(currency => server!.client.callTool({
      name: "monthly_summary", arguments: { year: 2026, month: 10, currency },
    }, undefined, { timeout: 3000 })))).map(unpack);
    assert.equal(usd.currency, "USD");
    assert.equal(usd.expenseMinor, 1250);
    assert.equal(eur.currency, "EUR");
    assert.equal(eur.expenseMinor, 990);
    const replay = unpack(await server.client.callTool({ name: "record_transaction", arguments: { ...originalInput, currency: "usd" } }));
    assert.deepEqual(replay, original);
    assert.equal(await readFile(path, "utf8"), before);
    unpack(await server.client.callTool({ name: "set_budget", arguments: { category: "food", month: "2026-10", limitMinor: 1000 } }));
    const budgetBytes = await readFile(path, "utf8");
    const ambiguous = await server.client.callTool({ name: "monthly_summary", arguments: { year: 2026, month: 10, currency: "USD" } });
    assert.equal(ambiguous.isError, true);
    assert.match((ambiguous.content as Array<{ text: string }>)[0].text, /budgets have no currency/);
    assert.deepEqual(unpack(await server.client.callTool({ name: "get_budgets", arguments: { month: "2026-10" } })), [{ category: "food", month: "2026-10", limitMinor: 1000 }]);
    assert.equal(await readFile(path, "utf8"), budgetBytes);
  } finally {
    await server?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
