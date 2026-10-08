import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
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
  const stopChild = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await exited;
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("server startup timed out: " + diagnostic)), 5000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error("server exited " + code + ": " + diagnostic)); });
      child.stdout.on("data", chunk => {
        if (String(chunk).includes("listening on")) { clearTimeout(timer); resolve(); }
      });
    });
    const client = new Client({ name: "cashflow-http-receiver", version: "1" }, { capabilities: {} });
    await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:" + port + "/mcp")));
    return { client, stop: async () => { try { await client.close(); } finally { await stopChild(); } } };
  } catch (error) {
    await stopChild();
    throw error;
  }
}

function unpack(result: unknown): any {
  const value = result as { isError?: boolean; content: Array<{ text: string }> };
  assert.notEqual(value.isError, true, value.content[0]?.text);
  return JSON.parse(value.content[0].text);
}

function refusal(result: unknown, expected: RegExp): void {
  const value = result as { isError?: boolean; content: Array<{ text: string }> };
  assert.equal(value.isError, true);
  assert.equal(value.content.length, 1);
  assert.match(value.content[0].text, expected);
}

test("real HTTP cashflow spans a year boundary, preserves monthly budgets and survives restart", { timeout: 20000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-http-cashflow-"));
  const path = join(dir, "ledger.json");
  let server: Awaited<ReturnType<typeof launch>> | undefined;
  const input = { type: "income", amountMinor: 1000, currency: "USD", category: "pay", date: "2025-12-01", idempotencyKey: "cashflow-pay" };
  const range = { fromMonth: "2025-12", toMonth: "2026-02" };
  try {
    server = await launch(path);
    const call = (name: string, args: Record<string, unknown>) => server!.client.callTool({ name, arguments: args }, undefined, { timeout: 3000 });
    const original = unpack(await call("record_transaction", input));
    for (const tx of [
      { type: "expense", amountMinor: 400, currency: "USD", category: "food", date: "2025-12-31" },
      { type: "income", amountMinor: 100, currency: "USD", category: "pay", date: "2026-02-01" },
      { type: "expense", amountMinor: 150, currency: "USD", category: "__proto__", date: "2026-02-28" },
      { type: "expense", amountMinor: 999, currency: "EUR", category: "outside", date: "2026-03-01" },
    ]) unpack(await call("record_transaction", tx));
    unpack(await call("set_budget", { category: "food", month: "2026-01", currency: "USD", limitMinor: 200 }));
    const before = await readFile(path, "utf8");
    // This valid existing-tool control runs on the original source too.
    const december = unpack(await call("monthly_summary", { year: 2025, month: 12 }));
    assert.deepEqual([december.incomeMinor, december.expenseMinor, december.netMinor], [1000, 400, 600]);
    const result = unpack(await call("cashflow_trend", range));
    const defs = (await server.client.listTools()).tools;
    const tool = defs.find(item => item.name === "cashflow_trend");
    assert.ok(tool);
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.ok(tool.inputSchema.properties?.fromMonth);
    assert.ok(tool.inputSchema.properties?.toMonth);
    assert.ok(tool.inputSchema.properties?.currency);
    assert.deepEqual(tool.inputSchema.required, ["fromMonth", "toMonth"]);
    assert.equal(result.currency, "USD");
    assert.equal(result.monthCount, 3);
    assert.deepEqual(result.totals, { incomeMinor: 1100, expenseMinor: 550, netMinor: 550 });
    assert.deepEqual(result.months.map((month: any) => [month.month, month.incomeMinor, month.expenseMinor, month.netMinor, month.cumulativeNetMinor]), [
      ["2025-12", 1000, 400, 600, 600], ["2026-01", 0, 0, 0, 600], ["2026-02", 100, 150, -50, 550],
    ]);
    for (const row of result.months) {
      const [year, month] = row.month.split("-").map(Number);
      const ordinary = unpack(await call("monthly_summary", { year, month, currency: "USD" }));
      for (const key of ["incomeMinor", "expenseMinor", "netMinor", "byCategory", "budgets"]) assert.deepEqual(row[key], ordinary[key]);
    }
    assert.deepEqual(result.months[1].budgets, [{ category: "food", currency: "USD", limitMinor: 200, spentMinor: 0, remainingMinor: 200, over: false }]);
    assert.equal(result.months[2].byCategory.__proto__.expenseMinor, 150);
    assert.equal(await readFile(path, "utf8"), before);
    await server.stop();
    server = undefined;
    server = await launch(path);
    assert.deepEqual(unpack(await call("cashflow_trend", range)), result);
    assert.deepEqual(unpack(await call("record_transaction", input)), original);
    assert.equal(await readFile(path, "utf8"), before);
  } finally {
    await server?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("real HTTP refuses cross-month currency mixing and unresolved budgets without writing", { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-http-cashflow-units-"));
  const path = join(dir, "ledger.json");
  let server: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    server = await launch(path);
    const call = (name: string, args: Record<string, unknown>) => server!.client.callTool({ name, arguments: args }, undefined, { timeout: 3000 });
    unpack(await call("record_transaction", { type: "expense", amountMinor: 120, currency: "USD", category: "food", date: "2026-01-01" }));
    unpack(await call("record_transaction", { type: "expense", amountMinor: 80, currency: "EUR", category: "food", date: "2026-02-01" }));
    const before = await readFile(path, "utf8");
    const range = { fromMonth: "2026-01", toMonth: "2026-02" };
    refusal(await call("cashflow_trend", range), /multiple currencies.*EUR.*USD.*supply currency/);
    const selected = unpack(await call("cashflow_trend", { ...range, currency: " usd " }));
    assert.equal(selected.currency, "USD");
    assert.deepEqual(selected.months.map((month: any) => month.expenseMinor), [120, 0]);
    assert.equal(selected.totals.expenseMinor, 120);
    for (const args of [
      { fromMonth: "2026-03", toMonth: "2026-02" },
      { fromMonth: "2020-01", toMonth: "2030-01" },
      { fromMonth: "2026-13", toMonth: "2026-13" },
      { ...range, currency: "dollars" },
    ]) refusal(await call("cashflow_trend", args), /month|currency/i);
    assert.equal(await readFile(path, "utf8"), before);
    unpack(await call("set_budget", { category: "food", month: "2026-03", limitMinor: 200 }));
    const unassigned = await readFile(path, "utf8");
    refusal(await call("cashflow_trend", { fromMonth: "2026-01", toMonth: "2026-03", currency: "USD" }), /2026-03.*budgets have no currency/);
    assert.equal(await readFile(path, "utf8"), unassigned);
    assert.deepEqual(unpack(await call("get_budgets", { month: "2026-03" })), [{ category: "food", month: "2026-03", limitMinor: 200 }]);
  } finally {
    await server?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});

test("real HTTP returns an empty period without creating a ledger and refuses unsafe period gross totals", { timeout: 15000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "ledger-http-cashflow-empty-"));
  const path = join(dir, "ledger.json");
  let server: Awaited<ReturnType<typeof launch>> | undefined;
  try {
    server = await launch(path);
    const call = (name: string, args: Record<string, unknown>) => server!.client.callTool({ name, arguments: args }, undefined, { timeout: 3000 });
    const range = { fromMonth: "2026-01", toMonth: "2026-02" };
    const empty = unpack(await call("cashflow_trend", range));
    assert.equal(empty.currency, null);
    assert.equal(empty.monthCount, 2);
    assert.deepEqual(empty.totals, { incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
    await assert.rejects(access(path), { code: "ENOENT" });
    for (const [date, amountMinor] of [["2026-01-01", Number.MAX_SAFE_INTEGER], ["2026-02-01", 1]] as const) {
      for (const type of ["income", "expense"]) unpack(await call("record_transaction", { type, date, amountMinor, currency: "USD", category: "test" }));
    }
    const before = await readFile(path, "utf8");
    // Every ordinary monthly total is safe and every monthly net is zero.
    for (const month of [1, 2]) assert.equal(unpack(await call("monthly_summary", { year: 2026, month })).netMinor, 0);
    refusal(await call("cashflow_trend", range), /period income.*safe integer/);
    assert.equal(await readFile(path, "utf8"), before);
  } finally {
    await server?.stop();
    await rm(dir, { recursive: true, force: true });
  }
});
