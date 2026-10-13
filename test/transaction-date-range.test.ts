import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyLedger, listTransactions, recordTransaction, ValidationError } from "../src/ledger.js";

function fixture() {
  const data = emptyLedger();
  for (const [date, category, type] of [
    ["2026-09-30", "food", "expense"],
    ["2026-10-01", "food", "expense"],
    ["2026-10-01", "pay", "income"],
    ["2026-10-31", "food", "expense"],
    ["2026-11-01", "food", "expense"],
  ] as const) {
    recordTransaction(data, { date, category, type, currency: "USD", amountMinor: 1250, note: "Authored example only" });
  }
  return data;
}

test("reversed valid endpoints are refused in populated and empty ledgers", () => {
  for (const data of [fixture(), emptyLedger()]) {
    const before = JSON.stringify(data);
    for (const [from, to] of [["2026-10-31", "2026-10-01"], ["2027-01-01", "2026-12-31"]]) {
      assert.throws(() => listTransactions(data, { from, to }), {
        name: "Error", message: "from must be on or before to",
      });
      assert.throws(() => listTransactions(data, { from, to }), ValidationError);
    }
    assert.equal(JSON.stringify(data), before);
  }
});

test("filters and pagination cannot turn a reversed interval into a valid empty selection", () => {
  const data = fixture();
  for (const extra of [{ limit: 0 }, { offset: 100 }, { category: "missing" }, { type: "income" as const }]) {
    assert.throws(() => listTransactions(data, { from: "2026-11-01", to: "2026-10-01", ...extra }), /from must be on or before to/);
  }
});

test("same-day inclusive selection retains original rows and stable tie ordering", () => {
  const data = fixture();
  const before = JSON.stringify(data);
  const result = listTransactions(data, { from: "2026-10-01", to: "2026-10-01" });
  assert.equal(result.total, 2);
  assert.equal(result.transactions[0], data.transactions[1]);
  assert.equal(result.transactions[1], data.transactions[2]);
  const page = listTransactions(data, { from: "2026-10-01", to: "2026-10-01", offset: 1, limit: 1 });
  assert.equal(page.total, 2);
  assert.equal(page.transactions[0], data.transactions[2]);
  assert.equal(JSON.stringify(data), before);
});

test("inclusive, open-ended and genuinely empty intervals keep their existing results", () => {
  const data = fixture();
  assert.deepEqual(listTransactions(data, { from: "2026-10-01", to: "2026-10-31" }).transactions,
    [data.transactions[3], data.transactions[1], data.transactions[2]]);
  assert.equal(listTransactions(data, { from: "2026-10-01" }).total, 4);
  assert.equal(listTransactions(data, { to: "2026-10-01" }).total, 3);
  assert.equal(listTransactions(data).total, 5);
  assert.deepEqual(listTransactions(data, { from: "2026-10-02", to: "2026-10-30" }), { total: 0, transactions: [] });
  assert.deepEqual(listTransactions(data, { from: "2026-10-01", to: "2026-10-31", limit: 0 }), { total: 3, transactions: [] });
  assert.equal(listTransactions(data, { from: "2026-10-01", to: "2026-10-31", category: "food", type: "expense" }).total, 2);
});

test("original endpoint validation still precedes range ordering", () => {
  const data = fixture();
  assert.throws(() => listTransactions(data, { from: "2026-02-30", to: "2026-01-01" }), /not a real calendar date/);
  assert.throws(() => listTransactions(data, { from: "2026-10-01", to: "2026-02-30" }), /not a real calendar date/);
  assert.throws(() => listTransactions(data, { from: "2026-10-1", to: "2026-01-01" }), /YYYY-MM-DD/);
  assert.throws(() => listTransactions(data, { from: null as never, to: "2026-01-01" }), /YYYY-MM-DD/);
});
