import assert from "node:assert/strict";
import { test } from "node:test";
import { cashflowTrend } from "../src/cashflow.js";
import { emptyLedger, monthlySummary, validateLedgerData, type LedgerData, type Transaction } from "../src/ledger.js";

function row(id: string, date: string, currency = "USD", amountMinor = 1): Transaction {
  return { id, date, currency, amountMinor, type: "expense", category: id, createdAt: "2026-01-01T00:00:00.000Z" };
}

test("a full 120-month saved snapshot retains each monthly summary and its source order", () => {
  const data: LedgerData = { version: 2, transactions: [], budgets: [] };
  for (let i = 119; i >= 0; i--) {
    const year = 2017 + Math.floor(i / 12);
    const month = i % 12 + 1;
    const label = `${year}-${String(month).padStart(2, "0")}`;
    data.transactions.push(row("last", `${label}-28`, " usd ", 10));
    data.transactions.push(row("__proto__", `${label}-01`, "USD", 2));
    data.transactions.push(row("first", `${label}-01`, "EUR", 7));
    data.budgets.push({ category: "last", month: label, currency: "USD", limitMinor: i });
    data.budgets.push({ category: "__proto__", month: label, currency: "EUR", limitMinor: 0 });
  }
  // The interval must not admit unrelated currency/budget context.
  data.transactions.push(row("outside", "2016-12-31", "CHF", 999));
  data.budgets.push({ category: "outside", month: "2027-01", limitMinor: 2 });
  const saved = JSON.stringify(data);
  const admitted = validateLedgerData(JSON.parse(saved));
  for (const currency of ["USD", "EUR", "JPY"]) {
    const result = cashflowTrend(admitted, { fromMonth: "2017-01", toMonth: "2026-12", currency });
    assert.equal(result.monthCount, 120);
    let running = 0;
    for (const item of result.months) {
      const [year, month] = item.month.split("-").map(Number);
      const expected = monthlySummary(admitted, year, month, currency);
      running += expected.netMinor;
      assert.deepEqual(item, { month: item.month, incomeMinor: expected.incomeMinor, expenseMinor: expected.expenseMinor,
        netMinor: expected.netMinor, cumulativeNetMinor: running, byCategory: expected.byCategory, budgets: expected.budgets });
      assert.equal(Object.getPrototypeOf(item.byCategory), null);
    }
  }
  assert.equal(JSON.stringify(admitted), saved);
});

test("changed input and adjacent intervals are recomputed rather than retained in a cache", () => {
  const data = emptyLedger();
  data.transactions.push(row("jan", "2026-01-01", "USD", 10));
  data.transactions.push(row("feb", "2026-02-01", "USD", 20));
  const input = { fromMonth: "2026-01", toMonth: "2026-02" };
  const original = cashflowTrend(data, input);
  data.transactions[1].amountMinor = 200;
  assert.equal(cashflowTrend(data, input).totals.expenseMinor, 210);
  assert.equal(cashflowTrend(data, { fromMonth: "2026-02", toMonth: "2026-03" }).totals.expenseMinor, 200);
  data.transactions[1].amountMinor = 20;
  assert.deepEqual(cashflowTrend(data, input), original);
  assert.equal(original.totals.expenseMinor, 30);
});

test("the earliest monthly refusal keeps its exact label and validation message", () => {
  const data = emptyLedger();
  data.transactions.push(row("mixed-a", "2026-02-01", "USD"), row("mixed-b", "2026-02-02", "EUR"));
  data.budgets.push({ category: "legacy", month: "2026-03", limitMinor: 20 });
  let firstFailure = "";
  try { monthlySummary(data, 2026, 2); } catch (error) { firstFailure = (error as Error).message; }
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-03" }),
    (error: unknown) => error instanceof Error && error.message === "2026-02: " + firstFailure);
  data.transactions.pop();
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-03" }), /2026-03: monthly category budgets have no currency/);
});

test("maximum-span selection visits saved transaction dates a bounded number of times", () => {
  const data = emptyLedger();
  let reads = 0;
  for (let i = 0; i < 240; i++) {
    const transaction = row(String(i), i % 2 === 0 ? "2017-01-01" : "2026-12-31");
    const date = transaction.date;
    Object.defineProperty(transaction, "date", { enumerable: true, get() { reads++; return date; } });
    data.transactions.push(transaction);
  }
  const result = cashflowTrend(data, { fromMonth: "2017-01", toMonth: "2026-12" });
  assert.equal(result.totals.expenseMinor, 240);
  assert.ok(reads <= 3 * data.transactions.length, `expected bounded date visits, observed ${reads}`);
});
