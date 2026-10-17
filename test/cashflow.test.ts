import assert from "node:assert/strict";
import { test } from "node:test";
import { cashflowTrend, MAX_CASHFLOW_MONTHS } from "../src/cashflow.js";
import { emptyLedger, monthlySummary, recordTransaction, setBudget, type LedgerData, ValidationError } from "../src/ledger.js";

function record(data: LedgerData, date: string, type: "income" | "expense", amountMinor: number, currency = "USD", category = "test") {
  return recordTransaction(data, { date, type, amountMinor, currency, category });
}

function freeze(value: unknown): void {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) freeze(nested);
  }
}

test("cashflow fills inclusive calendar months across a year boundary and preserves exact monthly results", () => {
  const data = emptyLedger();
  record(data, "2025-12-01", "income", 1000);
  record(data, "2025-12-31", "expense", 400, "USD", "food");
  record(data, "2026-02-01", "income", 100);
  record(data, "2026-02-28", "expense", 150, "USD", "__proto__");
  record(data, "2025-11-30", "income", 600, "EUR");
  record(data, "2026-03-01", "expense", 900, "EUR");
  setBudget(data, "food", "2026-01", 200, "USD");
  const before = JSON.stringify(data);
  freeze(data);
  const result = cashflowTrend(data, { fromMonth: "2025-12", toMonth: "2026-02" });
  assert.equal(result.currency, "USD");
  assert.equal(result.monthCount, 3);
  assert.deepEqual(result.totals, { incomeMinor: 1100, expenseMinor: 550, netMinor: 550 });
  assert.deepEqual(result.months.map(row => [row.month, row.netMinor, row.cumulativeNetMinor]), [
    ["2025-12", 600, 600], ["2026-01", 0, 600], ["2026-02", -50, 550],
  ]);
  for (const row of result.months) {
    const [year, month] = row.month.split("-").map(Number);
    const ordinary = monthlySummary(data, year, month);
    assert.deepEqual(
      [row.incomeMinor, row.expenseMinor, row.netMinor, row.byCategory, row.budgets],
      [ordinary.incomeMinor, ordinary.expenseMinor, ordinary.netMinor, ordinary.byCategory, ordinary.budgets],
    );
  }
  assert.equal(result.months[2].byCategory.__proto__.expenseMinor, 150);
  assert.equal(Object.getPrototypeOf(result.months[2].byCategory), null);
  assert.equal(JSON.stringify(data), before);
});

test("cashflow refuses different currencies in separately valid months before summing them", () => {
  const data = emptyLedger();
  record(data, "2026-01-01", "expense", 120, "USD");
  record(data, "2026-02-01", "expense", 80, "EUR");
  assert.equal(monthlySummary(data, 2026, 1).currency, "USD");
  assert.equal(monthlySummary(data, 2026, 2).currency, "EUR");
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-02" }), /multiple currencies \(EUR, USD\); supply currency/);
  const usd = cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-02", currency: " usd " });
  const eur = cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-02", currency: "EUR" });
  assert.equal(usd.currency, "USD");
  assert.deepEqual(usd.months.map(row => row.expenseMinor), [120, 0]);
  assert.deepEqual(eur.months.map(row => row.expenseMinor), [0, 80]);
  assert.equal(usd.totals.expenseMinor, 120);
  assert.equal(eur.totals.expenseMinor, 80);
});

test("cashflow inherits mixed-month admission and attributes the failing calendar month", () => {
  const data = emptyLedger();
  record(data, "2026-02-01", "income", 100, "USD");
  record(data, "2026-02-02", "income", 50, "EUR");
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-03" }), /2026-02: month contains multiple currencies/);
  assert.equal(cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-03", currency: "EUR" }).totals.incomeMinor, 50);
});

test("empty intervals retain a null denomination unless the caller selects one", () => {
  const data = emptyLedger();
  const empty = cashflowTrend(data, { fromMonth: "2026-02", toMonth: "2026-04" });
  assert.equal(empty.currency, null);
  assert.equal(empty.monthCount, 3);
  assert.deepEqual(empty.totals, { incomeMinor: 0, expenseMinor: 0, netMinor: 0 });
  assert.deepEqual(empty.months.map(row => row.cumulativeNetMinor), [0, 0, 0]);
  const selected = cashflowTrend(data, { fromMonth: "2026-02", toMonth: "2026-04", currency: "jpy" });
  assert.equal(selected.currency, "JPY");
  assert.deepEqual(selected.totals, empty.totals);
  assert.deepEqual(data, emptyLedger());
});

test("planned-only budgets participate in the interval denomination without inventing spending", () => {
  const data = emptyLedger();
  setBudget(data, "food", "2026-02", 500, "EUR");
  setBudget(data, "food", "2026-05", 600, "USD");
  const result = cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-03" });
  assert.equal(result.currency, "EUR");
  assert.deepEqual(result.months[1].budgets, monthlySummary(data, 2026, 2).budgets);
  assert.equal(result.months[1].budgets[0].spentMinor, 0);
  assert.equal(result.months[1].budgets[0].remainingMinor, 500);
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-05" }), /multiple currencies/);
});

test("valid unassigned-budget semantics are preserved and ambiguous budgets are never assigned on read", () => {
  const data = emptyLedger();
  record(data, "2026-01-10", "expense", 120);
  setBudget(data, "test", "2026-01", 100);
  const before = JSON.stringify(data);
  const result = cashflowTrend(data, { fromMonth: "2025-12", toMonth: "2026-02" });
  assert.deepEqual(result.months[1].budgets, monthlySummary(data, 2026, 1).budgets);
  assert.equal(result.months[1].budgets[0].over, true);
  assert.equal(JSON.stringify(data), before);
  setBudget(data, "test", "2026-02", 100);
  const unassigned = JSON.stringify(data);
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-02", currency: "USD" }), /2026-02: monthly category budgets have no currency/);
  assert.equal(JSON.stringify(data), unassigned);
  assert.equal(data.version, 1);
});

test("legacy budgets keep their wrong-selector and mixed-transaction refusals", () => {
  const data = emptyLedger();
  record(data, "2026-01-10", "expense", 120, "USD");
  setBudget(data, "test", "2026-01", 100);
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-01", currency: "EUR" }), /budgets have no currency/);
  record(data, "2026-01-11", "expense", 80, "EUR");
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-01", currency: "USD" }), /budgets have no currency/);
});

test("calendar bounds are explicit, inclusive and independent of Date rollover", () => {
  const data = emptyLedger();
  assert.equal(MAX_CASHFLOW_MONTHS, 120);
  assert.equal(cashflowTrend(data, { fromMonth: "1970-01", toMonth: "1979-12" }).monthCount, 120);
  assert.equal(cashflowTrend(data, { fromMonth: "9999-12", toMonth: "9999-12" }).months[0].month, "9999-12");
  assert.deepEqual(cashflowTrend(data, { fromMonth: "2024-02", toMonth: "2024-03" }).months.map(row => row.month), ["2024-02", "2024-03"]);
  for (const [fromMonth, toMonth] of [
    ["1969-12", "1970-01"], ["9999-12", "10000-01"], ["2026-00", "2026-01"],
    ["2026-01", "2026-13"], ["2026-1", "2026-02"], ["2026-02", "2026-01"],
    ["1970-01", "1980-01"], [" 2026-01", "2026-02"], ["2026-01-01", "2026-02"],
  ]) assert.throws(() => cashflowTrend(data, { fromMonth, toMonth }), ValidationError);
});

test("invalid runtime arguments and currency inputs fail explicitly", () => {
  const data = emptyLedger();
  for (const input of [null, undefined, [], {}, { fromMonth: 2026, toMonth: "2026-01" }]) {
    assert.throws(() => cashflowTrend(data, input as never), ValidationError);
  }
  for (const currency of ["", "US", "USDX", 123, null]) {
    assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-02", currency: currency as never }), /currency/);
  }
});

test("safe monthly net cancellation cannot conceal unsafe period income or expense totals", () => {
  for (const overflowType of ["income", "expense"] as const) {
    const data = emptyLedger();
    record(data, "2026-01-01", overflowType, Number.MAX_SAFE_INTEGER);
    record(data, "2026-02-01", overflowType, 1);
    const before = JSON.stringify(data);
    for (const month of [1, 2]) assert.ok(Number.isSafeInteger(monthlySummary(data, 2026, month).netMinor));
    assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-02" }), new RegExp("period " + overflowType + ".*safe integer"));
    assert.equal(JSON.stringify(data), before);
  }
  const cancellation = emptyLedger();
  for (const type of ["income", "expense"] as const) {
    record(cancellation, "2026-01-01", type, Number.MAX_SAFE_INTEGER);
    record(cancellation, "2026-02-01", type, 1);
  }
  assert.equal(monthlySummary(cancellation, 2026, 1).netMinor, 0);
  assert.equal(monthlySummary(cancellation, 2026, 2).netMinor, 0);
  assert.throws(() => cashflowTrend(cancellation, { fromMonth: "2026-01", toMonth: "2026-02" }), /period income.*safe integer/);
});

test("safe positive and negative boundaries stay exact and unselected currencies stay separate", () => {
  const data = emptyLedger();
  record(data, "2026-01-01", "income", Number.MAX_SAFE_INTEGER);
  record(data, "2026-02-01", "expense", Number.MAX_SAFE_INTEGER);
  record(data, "2026-01-01", "income", Number.MAX_SAFE_INTEGER, "EUR");
  record(data, "2026-02-01", "income", Number.MAX_SAFE_INTEGER, "EUR");
  const usd = cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-02", currency: "USD" });
  assert.deepEqual(usd.totals, { incomeMinor: Number.MAX_SAFE_INTEGER, expenseMinor: Number.MAX_SAFE_INTEGER, netMinor: 0 });
  assert.deepEqual(usd.months.map(row => row.cumulativeNetMinor), [Number.MAX_SAFE_INTEGER, 0]);
  assert.throws(() => cashflowTrend(data, { fromMonth: "2026-01", toMonth: "2026-02", currency: "EUR" }), /period income/);
  const negative = emptyLedger();
  record(negative, "2026-01-01", "expense", Number.MAX_SAFE_INTEGER);
  assert.equal(cashflowTrend(negative, { fromMonth: "2026-01", toMonth: "2026-02" }).months[1].cumulativeNetMinor, -Number.MAX_SAFE_INTEGER);
});
