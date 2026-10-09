import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/index.js";
import { LedgerStore } from "../src/ledger.js";

function textOf(result: unknown): string {
  const r = result as { content: Array<{ type: string; text: string }> };
  assert.equal(r.content[0].type, "text");
  return r.content[0].text;
}

describe("mcp tools", () => {
  let dir = "";
  let client: Client;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "hlm-mcp-"));
    const store = new LedgerStore(join(dir, "ledger.json"));
    const server = createMcpServer(store);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: "test", version: "0" }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  it("exposes the ten ledger tools", async () => {
    const { tools } = await client.listTools();
    assert.deepEqual(
      tools.map((t) => t.name).sort(),
      ["cashflow_trend", "commit_budget_removal", "commit_transaction_import", "get_budgets", "list_transactions", "monthly_summary", "preview_budget_removal", "preview_transaction_import", "record_transaction", "set_budget"]
    );
  });

  it("records, lists, summarizes, and budgets end to end", async () => {
    const recorded = JSON.parse(
      textOf(
        await client.callTool({
          name: "record_transaction",
          arguments: { type: "expense", amountMinor: 1250, currency: "USD", date: "2026-10-06", category: "groceries", note: "milk" },
        })
      )
    );
    assert.equal(recorded.category, "groceries");
    assert.ok(recorded.id);

    const listed = JSON.parse(textOf(await client.callTool({ name: "list_transactions", arguments: {} })));
    assert.equal(listed.total, 1);

    await client.callTool({
      name: "set_budget",
      arguments: { category: "groceries", month: "2026-10", limitMinor: 1000 },
    });
    const summary = JSON.parse(
      textOf(await client.callTool({ name: "monthly_summary", arguments: { year: 2026, month: 10 } }))
    );
    assert.equal(summary.expenseMinor, 1250);
    assert.equal(summary.budgets[0].over, true);
    assert.equal(summary.budgets[0].remainingMinor, -250);

    const budgets = JSON.parse(
      textOf(await client.callTool({ name: "get_budgets", arguments: { month: "2026-10" } }))
    );
    assert.equal(budgets.length, 1);
  });

  it("returns isError for invalid input instead of throwing", async () => {
    const result = (await client.callTool({
      name: "record_transaction",
      arguments: { type: "expense", amountMinor: -5, currency: "USD", date: "2026-10-06", category: "x" },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /positive integer/);
  });

  it("persists across separate tool calls", async () => {
    await client.callTool({
      name: "record_transaction",
      arguments: { type: "income", amountMinor: 999, currency: "USD", date: "2026-10-01", category: "pay" },
    });
    const listed = JSON.parse(textOf(await client.callTool({ name: "list_transactions", arguments: {} })));
    assert.equal(listed.total, 1);
    await rm(dir, { recursive: true, force: true });
  });
});
