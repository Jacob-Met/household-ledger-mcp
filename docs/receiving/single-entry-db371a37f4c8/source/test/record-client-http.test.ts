import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as httpServer } from "node:http";
import { createServer } from "node:net";
import { mkdtemp, readFile, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { prepareRecording, saveRecordingRequest, loadRecordingRequest, sendRecording } from "../src/record-client.js";

async function freePort() {
  const p = createServer(); p.listen(0, "127.0.0.1"); await once(p, "listening");
  const address = p.address(); assert.ok(address && typeof address === "object");
  const port = address.port; await new Promise<void>((resolve, reject) => p.close(e => e ? reject(e) : resolve())); return port;
}
async function launch(path: string, port: number) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    env: { ...process.env, HOUSEHOLD_LEDGER_DATA_PATH: path, HOUSEHOLD_LEDGER_HOST: "127.0.0.1", HOUSEHOLD_LEDGER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let diagnostic = "";
  child.stderr.on("data", b => { diagnostic += b; });
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit"); child.kill("SIGTERM"); await exited;
    }
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Native server startup timed out: " + diagnostic)), 15000);
      child.once("error", e => { clearTimeout(timer); reject(e); });
      child.once("exit", code => { clearTimeout(timer); reject(Error("Server exit " + code + ": " + diagnostic)); });
      child.stdout.on("data", b => { if (String(b).includes("listening on")) { clearTimeout(timer); resolve(); } });
    });
    return { stop };
  } catch (e) { await stop(); throw e; }
}
const fields = { type: "expense", amountMinor: 1250, currency: " usd ", date: "2026-10-08", category: " food ", note: '東京 receipt "A"\nline' };
test("real MCP success, recovery in a fresh server, conflict and unrelated record preservation", { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "single-record-http-")); const path = join(dir, "ledger.json");
  const port = await freePort(); const endpoint = "http://127.0.0.1:" + port + "/mcp";
  let server: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    const r = prepareRecording(endpoint, fields, "native-exact-key");
    await saveRecordingRequest(join(dir, "request.json"), r);
    server = await launch(path, port);
    const first = await sendRecording(r); assert.equal(first.status, "confirmed");
    const unrelated = await sendRecording(prepareRecording(endpoint, { type: "income", amountMinor: 99, currency: "EUR", date: "2026-10-07", category: "__proto__" }, "unrelated"));
    assert.equal(unrelated.status, "confirmed");
    const before = await readFile(path); const info = await stat(path);
    await server.stop(); server = undefined; server = await launch(path, port);
    const retry = await sendRecording(await loadRecordingRequest(join(dir, "request.json")));
    assert.deepEqual(retry, first); assert.deepEqual(await readFile(path), before);
    assert.equal((await stat(path)).mtimeMs, info.mtimeMs); assert.equal((await stat(path)).ino, info.ino);
    const conflict = await sendRecording(prepareRecording(endpoint, { ...fields, amountMinor: 1251 }, "native-exact-key"));
    assert.equal(conflict.status, "unconfirmed"); assert.deepEqual(await readFile(path), before);
    const disk = JSON.parse(before.toString()); assert.equal(disk.transactions.length, 2);
    assert.equal(disk.transactions[0].amountMinor, 1250); assert.equal(disk.transactions[0].currency, "USD");
    assert.equal(disk.transactions[0].category, "food"); assert.equal(disk.transactions[0].note, fields.note);
    assert.equal(disk.transactions[1].idempotencyKey, "unrelated");
  } finally { await server?.stop(); await rm(dir, { recursive: true, force: true }); }
});
test("actual committed response loss remains unconfirmed; explicit same-request retry returns the single original", { timeout: 60000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "single-record-loss-")); const path = join(dir, "ledger.json");
  const port = await freePort(); const server = await launch(path, port);
  let drop = true, calls = 0;
  const proxy = httpServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []; for await (const b of req) chunks.push(Buffer.from(b));
      const body = Buffer.concat(chunks); const json = body.length ? JSON.parse(body.toString()) : {};
      const recording = json.method === "tools/call" && json.params?.name === "record_transaction";
      if (recording) calls++;
      const upstream = await fetch("http://127.0.0.1:" + port + (req.url ?? "/mcp"), {
        method: req.method, headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: req.method === "POST" ? body : undefined,
      });
      const bytes = Buffer.from(await upstream.arrayBuffer());
      if (recording && drop) { res.destroy(); return; }
      res.writeHead(upstream.status, { "content-type": upstream.headers.get("content-type") ?? "application/json" }); res.end(bytes);
    } catch (e) { res.destroy(e as Error); }
  });
  proxy.listen(0, "127.0.0.1"); await once(proxy, "listening");
  const addr = proxy.address(); assert.ok(addr && typeof addr === "object");
  try {
    const r = prepareRecording("http://127.0.0.1:" + addr.port + "/mcp", fields, "lost-key");
    const recovery = join(dir, "request.json"); await saveRecordingRequest(recovery, r);
    const saved = await readFile(recovery);
    const first = await sendRecording(r); assert.equal(first.status, "unconfirmed"); assert.equal(calls, 1);
    const before = await readFile(path); const tx = JSON.parse(before.toString()).transactions;
    assert.equal(tx.length, 1); assert.equal(tx[0].idempotencyKey, "lost-key");
    assert.deepEqual(await readFile(recovery), saved);
    drop = false;
    const retried = await sendRecording(await loadRecordingRequest(recovery));
    assert.equal(retried.status, "confirmed");
    if (retried.status === "confirmed") assert.deepEqual(retried.transaction, tx[0]);
    assert.equal(calls, 2); assert.deepEqual(await readFile(path), before);
  } finally { proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve())); await server.stop(); await rm(dir, { recursive: true, force: true }); }
});
test("an already canceled operation makes no connection or recording call", async () => {
  const abort = new AbortController(); abort.abort();
  const r = prepareRecording("http://127.0.0.1:9/mcp", fields, "canceled");
  assert.equal((await sendRecording(r, abort.signal)).status, "not_sent");
});
