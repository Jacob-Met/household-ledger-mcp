import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LedgerStore } from "../src/ledger.js";

async function launch(path: string) {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close(err => err ? reject(err) : resolve()));
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
      child.once("error", err => { clearTimeout(timer); reject(err); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`server exited ${code}: ${diagnostic}`)); });
      child.stdout.on("data", chunk => {
        if (String(chunk).includes("listening on")) { clearTimeout(timer); resolve(); }
      });
    });
    const client = new Client({ name: "http-recording-receiver", version: "1" }, { capabilities: {} });
    const url = new URL(`http://127.0.0.1:${port}`);
    const health = await fetch(new URL("/healthz", url));
    assert.equal(health.status, 200);
    await client.connect(new StreamableHTTPClientTransport(new URL("/mcp", url)));
    return { client, stop: async () => { await client.close(); await stop(); } };
  } catch (error) {
    await stop();
    throw error;
  }
}

function unpack(result: unknown): any {
  const r = result as { isError?: boolean; content: Array<{ text: string }> };
  assert.notEqual(r.isError, true, r.content[0]?.text);
  return JSON.parse(r.content[0].text);
}

test("real Streamable HTTP requests retain concurrent writes and deduplicate after process restart", { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-http-recording-"));
  const path = join(dir, "ledger.json");
  let server: Awaited<ReturnType<typeof launch>> | undefined;
  const args = { type: "expense", amountMinor: 700, currency: "USD", date: "2026-10-08", category: "food", idempotencyKey: "http-purchase-0" };
  try {
    server = await launch(path);
    const catalogue = await server.client.listTools();
    const tool = catalogue.tools.find(t => t.name === "record_transaction");
    assert.ok(tool?.inputSchema.properties?.idempotencyKey);
    const client = server.client;
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => client.callTool({
      name: "record_transaction", arguments: { ...args, idempotencyKey: `http-purchase-${i}` },
    })));
    const first = unpack(results[0]);
    for (const result of results) unpack(result);
    assert.equal((await new LedgerStore(path).load()).transactions.length, 12);
    await server.stop();
    server = undefined;
    server = await launch(path);
    const replay = unpack(await server.client.callTool({ name: "record_transaction", arguments: args }));
    assert.deepEqual(replay, first);
    assert.equal((await new LedgerStore(path).load()).transactions.length, 12);
    const conflict = await server.client.callTool({ name: "record_transaction", arguments: { ...args, amountMinor: 701 } });
    assert.equal(conflict.isError, true);
    assert.equal((await new LedgerStore(path).load()).transactions.length, 12);
  } finally {
    await server?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
