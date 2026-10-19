import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../src/index.js";
import {
  LedgerStore,
  emptyLedger,
  monthlySummary,
  recordTransaction,
  setBudget,
} from "../src/ledger.js";

// Preserve the surrounding process when this regression is replayed against
// the original implementation, which can mutate inherited objects.
function inheritedTotals(category: string): { unchanged: () => void; restore: () => void } {
  const inherited = ({} as Record<string, unknown>)[category];
  const target = inherited !== null && (typeof inherited === "object" || typeof inherited === "function")
    ? inherited
    : undefined;
  const fields = ["incomeMinor", "expenseMinor"] as const;
  const before = fields.map((field) => target && Object.getOwnPropertyDescriptor(target, field));
  return {
    unchanged() {
      if (target) fields.forEach((field, i) => assert.deepEqual(Object.getOwnPropertyDescriptor(target, field), before[i]));
    },
    restore() {
      if (target) fields.forEach((field, i) => {
        const descriptor = before[i];
        if (descriptor) Object.defineProperty(target, field, descriptor);
        else Reflect.deleteProperty(target, field);
      });
    },
  };
}

describe("monthly summary category names", () => {
  for (const category of ["__proto__", "constructor", "toString", "hasOwnProperty", "groceries"]) {
    it(`preserves ${JSON.stringify(category)} totals and budget status without changing inherited objects`, () => {
      const inherited = inheritedTotals(category);
      try {
        const data = emptyLedger();
        for (const amountMinor of [1250, 350]) {
          recordTransaction(data, { type: "expense", amountMinor, currency: "USD", date: "2026-10-08", category });
        }
        recordTransaction(data, { type: "income", amountMinor: 250, currency: "USD", date: "2026-10-08", category });
        recordTransaction(data, { type: "expense", amountMinor: 99, currency: "USD", date: "2026-09-30", category });
        setBudget(data, category, "2026-10", 1000);
        const original = JSON.stringify(data);

        for (let call = 0; call < 2; call++) {
          const summary = monthlySummary(data, 2026, 10);
          const wire = JSON.parse(JSON.stringify(summary));
          assert.equal(Object.hasOwn(wire.byCategory, category), true);
          assert.deepEqual(wire.byCategory[category], { incomeMinor: 250, expenseMinor: 1600 });
          assert.equal(wire.incomeMinor, 250);
          assert.equal(wire.expenseMinor, 1600);
          assert.equal(wire.netMinor, -1350);
          assert.deepEqual(wire.budgets, [{ category, limitMinor: 1000, spentMinor: 1600, remainingMinor: -600, over: true }]);
          inherited.unchanged();
          assert.equal(JSON.stringify(data), original);
        }
      } finally {
        inherited.restore();
      }
    });
  }

  it("keeps reserved and ordinary categories separate and reports an unspent reserved-name budget as zero", () => {
    const data = emptyLedger();
    const inherited = inheritedTotals("__proto__");
    try {
      recordTransaction(data, { type: "expense", amountMinor: 400, currency: "USD", date: "2026-10-08", category: "__proto__" });
      recordTransaction(data, { type: "expense", amountMinor: 600, currency: "USD", date: "2026-10-08", category: "groceries" });
      setBudget(data, "toString", "2026-10", 500);
      const wire = JSON.parse(JSON.stringify(monthlySummary(data, 2026, 10)));
      assert.deepEqual(Object.keys(wire.byCategory).sort(), ["__proto__", "groceries"]);
      assert.equal(wire.byCategory.__proto__.expenseMinor, 400);
      assert.equal(wire.byCategory.groceries.expenseMinor, 600);
      assert.equal(wire.expenseMinor, 1000);
      assert.deepEqual(wire.budgets, [{ category: "toString", limitMinor: 500, spentMinor: 0, remainingMinor: 500, over: false }]);
      inherited.unchanged();
    } finally {
      inherited.restore();
    }
  });

  it("returns the same reserved-category breakdown and over-budget result through the real MCP tool", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hlm-category-mcp-"));
    const store = new LedgerStore(join(dir, "ledger.json"));
    const server = createMcpServer(store);
    const client = new Client({ name: "category-regression", version: "0" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const inherited = inheritedTotals("constructor");
    const call = async (name: string, args: Record<string, unknown>) => {
      const result = await client.callTool({ name, arguments: args });
      assert.notEqual(result.isError, true);
      const content = result.content as Array<{ type: string; text: string }>;
      assert.equal(content[0].type, "text");
      return JSON.parse(content[0].text);
    };
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      await call("record_transaction", { type: "expense", amountMinor: 1250, currency: "USD", date: "2026-10-08", category: "constructor" });
      await call("set_budget", { category: "constructor", month: "2026-10", limitMinor: 1000 });
      const summary = await call("monthly_summary", { year: 2026, month: 10 });
      assert.equal(Object.hasOwn(summary.byCategory, "constructor"), true);
      assert.deepEqual(summary.byCategory.constructor, { incomeMinor: 0, expenseMinor: 1250 });
      assert.deepEqual(summary.budgets, [{ category: "constructor", limitMinor: 1000, spentMinor: 1250, remainingMinor: -250, over: true }]);
      inherited.unchanged();
      const saved = await new LedgerStore(join(dir, "ledger.json")).load();
      assert.equal(saved.transactions.length, 1);
      assert.equal(saved.transactions[0].category, "constructor");
    } finally {
      inherited.restore();
      await client.close();
      await server.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
