import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LedgerStore, setBudget } from "../src/ledger.js";
import { createMcpServer } from "../src/index.js";
import { commitBudgetReallocation } from "../src/budget-reallocation.js";
import { ReallocationSession } from "../src/reallocation-client.js";

async function listen(server: Server): Promise<string> {
  await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
  const address = server.address(); assert.ok(address && typeof address === "object");
  return "http://127.0.0.1:" + address.port + "/mcp";
}
async function close(server: Server): Promise<void> {
  server.closeAllConnections(); await new Promise<void>(r => server.close(() => r()));
}
test("actual MCP: review/cancel, exact apply, already-matching and stale whole refusal preserve unrelated state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reallocation-client-http-"));
  const path = join(dir, "ledger.json"), store = new LedgerStore(path), calls: string[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    if (body?.method === "tools/call") calls.push(body.params.name);
    const mcp = createMcpServer(store), transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try { await mcp.connect(transport); await transport.handleRequest(req, res, body); }
    finally { await transport.close(); await mcp.close(); }
  });
  const sessions: ReallocationSession[] = [];
  try {
    await store.update(data => {
      setBudget(data, " food ", "2026-10", 12000, "USD"); setBudget(data, "交通", "2026-10", 3300, "USD");
      setBudget(data, " food ", "2026-10", 777, "EUR"); setBudget(data, "later", "2026-11", 444, "USD");
      // Preserve the existing literal stored identity instead of setBudget's trimmed new name.
      data.budgets[0].category = " food "; data.budgets[2].category = " food ";
    });
    const before = await readFile(path), endpoint = await listen(server);
    const input = { month: "2026-10", currency: "USD", fromCategory: " food ", toCategory: "交通", amountMinor: 2500 };
    const connect = async () => { const s = new ReallocationSession(endpoint); sessions.push(s); await s.connect(); return s; };
    const canceled = await connect(); assert.equal((await canceled.budgets("2026-10", "USD")).length, 2);
    const review = await canceled.preview(input); await canceled.close(); assert.deepEqual(await readFile(path), before);
    assert.equal(calls.filter(n => n === "commit_budget_reallocation").length, 0);
    const apply = await connect(), reviewed = await apply.preview(input);
    const tampered = structuredClone(reviewed); tampered.from.category = "food";
    assert.equal((await apply.commit(tampered)).status, "not_sent");
    assert.equal((await apply.commit(reviewed)).status, "applied");
    assert.equal((await apply.commit(reviewed)).status, "not_sent");
    const data = await store.load();
    assert.deepEqual(data.budgets.map(b => b.limitMinor), [9500, 5800, 777, 444]);
    const matching = await connect(), another = await matching.preview({ ...input, amountMinor: 100 });
    await commitBudgetReallocation(store, { review: another });
    const matchingBefore = await readFile(path), matchingStat = await stat(path);
    assert.equal((await matching.commit(another)).status, "already_matching");
    assert.deepEqual(await readFile(path), matchingBefore); assert.equal((await stat(path)).mtimeMs, matchingStat.mtimeMs);
    const stale = await connect(), old = await stale.preview(input);
    await store.update(d => { d.budgets[0].limitMinor = 9100; });
    const changed = await readFile(path);
    const refused = await stale.commit(old); assert.equal(refused.status, "unconfirmed");
    assert.deepEqual(await readFile(path), changed); assert.equal((await stale.commit(old)).status, "not_sent");
    assert.equal(calls.filter(n => n === "commit_budget_reallocation").length, 3);
    assert.deepEqual(review.from, { category: " food ", beforeMinor: 12000, afterMinor: 9500 });
  } finally { for (const s of sessions) await s.close(); await close(server); await rm(dir, { recursive: true, force: true }); }
});
test("actual upstream commit with lost acknowledgement stays unconfirmed and never retries", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reallocation-client-lost-"));
  const path = join(dir, "ledger.json"), store = new LedgerStore(path);
  let commits = 0, dropped = false;
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
    if (body?.method === "tools/call" && body.params.name === "commit_budget_reallocation") commits++;
    const mcp = createMcpServer(store), transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    try { await mcp.connect(transport); await transport.handleRequest(req, res, body); }
    finally { await transport.close(); await mcp.close(); }
  });
  let session: ReallocationSession | undefined;
  let proxy: Server | undefined;
  try {
    await store.update(d => { setBudget(d, "one", "2026-10", 1000, "JPY"); setBudget(d, "two", "2026-10", 0, "JPY"); });
    const target = await listen(upstream);
    proxy = createServer(async (req, res) => {
      // Stateless transport has no session GET stream. Any incidental GET is
      // refused here; the fault concerns only the real complete commit POST.
      if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks), parsed = JSON.parse(body.toString());
      const response = await fetch(target, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (parsed.method === "tools/call" && parsed.params.name === "commit_budget_reallocation") {
        assert.equal(commits, 1); assert.equal((await store.load()).budgets[0].limitMinor, 750);
        dropped = true; res.destroy(); return;
      }
      res.writeHead(response.status, { "content-type": response.headers.get("content-type") || "application/json" }); res.end(bytes);
    });
    session = new ReallocationSession(await listen(proxy)); await session.connect();
    const review = await session.preview({ month: "2026-10", currency: "JPY", fromCategory: "one", toCategory: "two", amountMinor: 250 });
    assert.equal((await session.commit(review)).status, "unconfirmed"); assert.equal(dropped, true); assert.equal(commits, 1);
    const after = await readFile(path);
    assert.equal((await session.commit(review)).status, "not_sent"); assert.equal(commits, 1); assert.deepEqual(await readFile(path), after);
    assert.deepEqual((await store.load()).budgets.map(b => b.limitMinor), [750, 250]);
  } finally { await session?.close(); if (proxy) await close(proxy); await close(upstream); await rm(dir, { recursive: true, force: true }); }
});
