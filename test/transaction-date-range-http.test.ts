import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, stat, rm, access } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { emptyLedger, recordTransaction } from "../src/ledger.js";

async function launch(dataPath: string) {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  // Invoke the unchanged exported HTTP main explicitly, including on Windows.
  const entry = new URL("../src/index.js", import.meta.url).href;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", `import {main} from ${JSON.stringify(entry)}; await main();`], {
    env: { ...process.env, HOUSEHOLD_LEDGER_DATA_PATH: dataPath, HOUSEHOLD_LEDGER_HOST: "127.0.0.1", HOUSEHOLD_LEDGER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "", errors = "";
  child.stderr.on("data", chunk => { errors += String(chunk); });
  const client = new Client({ name: "date-range-receiver", version: "1" }, { capabilities: {} });
  const stop = async () => {
    try { await client.close(); }
    finally {
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, "exit");
        child.kill("SIGTERM");
        await closed;
      }
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`HTTP startup timed out: ${errors}`)), 5000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`HTTP process exited ${code}: ${errors}`)); });
      child.stdout.on("data", chunk => {
        output += String(chunk);
        if (output.includes("listening on")) { clearTimeout(timer); resolve(); }
      });
    });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    return { client, stop, errors: () => errors };
  } catch (error) {
    await stop();
    throw error;
  }
}

function unpack(result: unknown) {
  const r = result as { isError?: boolean; content: Array<{ type: string; text: string }> };
  assert.notEqual(r.isError, true, r.content[0]?.text);
  assert.equal(r.content[0].type, "text");
  return JSON.parse(r.content[0].text);
}

test("real HTTP distinguishes reversed intervals from empty results without rewriting a saved ledger", { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-date-range-"));
  const path = join(dir, "ledger.json");
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const data = emptyLedger();
    const first = recordTransaction(data, { type: "expense", amountMinor: 1250, currency: "USD", date: "2026-10-01", category: "food", note: "Literal café\nsecond line" });
    const last = recordTransaction(data, { type: "income", amountMinor: 8000, currency: "USD", date: "2026-10-31", category: "pay" });
    await writeFile(path, JSON.stringify(data, null, 2) + "\n");
    const bytes = await readFile(path), before = await stat(path, { bigint: true });
    running = await launch(path);
    const invalid = await running.client.callTool({ name: "list_transactions", arguments: { from: "2026-10-31", to: "2026-10-01" } });
    assert.equal(invalid.isError, true);
    assert.deepEqual(invalid.content, [{ type: "text", text: "from must be on or before to" }]);
    const listed = unpack(await running.client.callTool({ name: "list_transactions", arguments: { from: "2026-10-01", to: "2026-10-31" } }));
    assert.deepEqual(listed, { total: 2, transactions: [last, first] });
    const equal = unpack(await running.client.callTool({ name: "list_transactions", arguments: { from: "2026-10-01", to: "2026-10-01" } }));
    assert.deepEqual(equal, { total: 1, transactions: [first] });
    const empty = unpack(await running.client.callTool({ name: "list_transactions", arguments: { from: "2026-10-02", to: "2026-10-30" } }));
    assert.deepEqual(empty, { total: 0, transactions: [] });
    await running.stop();
    assert.equal(running.errors(), "");
    running = undefined;
    assert.deepEqual(await readFile(path), bytes);
    const after = await stat(path, { bigint: true });
    assert.equal(after.ino, before.ino);
    assert.equal(after.mtimeNs, before.mtimeNs);
  } finally {
    await running?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("real HTTP refuses a reversed range on a missing ledger without creating it", { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-missing-range-"));
  const path = join(dir, "absent.json");
  let running: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    running = await launch(path);
    const result = await running.client.callTool({ name: "list_transactions", arguments: { from: "2027-01-01", to: "2026-12-31", limit: 0 } });
    assert.equal(result.isError, true);
    assert.deepEqual(result.content, [{ type: "text", text: "from must be on or before to" }]);
    assert.deepEqual(unpack(await running.client.callTool({ name: "list_transactions", arguments: {} })), { total: 0, transactions: [] });
    await running.stop();
    assert.equal(running.errors(), "");
    running = undefined;
    await assert.rejects(access(path), { code: "ENOENT" });
  } finally {
    await running?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
