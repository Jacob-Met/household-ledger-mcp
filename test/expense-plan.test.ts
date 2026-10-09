import assert from "node:assert/strict";
import { test } from "node:test";
import {
  identifySnapshot, MAX_CATEGORIES, MAX_EXPENSES, MAX_PLAN_BYTES, parseSnapshot,
  previewExpensePlan, renderExpensePlan,
} from "../src/expense-plan.js";
import type { LedgerData } from "../src/ledger.js";

const plan = (expenses: unknown[] = []) => ({ schema: "household-expense-plan/1", expenses });
const expense = (amountMinor = 1, category = "food", extra = {}) =>
  ({ date: "2026-10-20", amountMinor, category, ...extra });
const tx = (amountMinor: number, category = "food", extra = {}) =>
  ({ id: "existing", type: "expense" as const, amountMinor, category, currency: "USD", date: "2026-10-01", createdAt: "2026-10-01T00:00:00Z", ...extra });
const ledger = (transactions: LedgerData["transactions"] = [], budgets: LedgerData["budgets"] = []): LedgerData =>
  ({ version: 2, transactions, budgets });
const budget = (category = "food", limitMinor = 10, currency?: string) =>
  ({ category, month: "2026-10", limitMinor, ...(currency === undefined ? {} : { currency }) });
const identity = { ledger: { path: "fictional-ledger.json", bytes: 1, sha256: "a".repeat(64) },
  plan: { path: "fictional-plan.json", bytes: 1, sha256: "b".repeat(64) }, generatedAt: "2026-10-08T00:00:00Z" };

test("complete recorded/planned/hypothetical model retains repeated rows and the source", () => {
  const data = ledger([tx(45000), tx(20000, "travel"),
    tx(500000, "salary", { type: "income" as const }), tx(900, "food", { currency: "EUR" })],
  [budget("food", 50000, "USD"), budget("travel", 30000, "USD"), budget("food", 1000, "EUR")]);
  const input = plan([expense(3750), expense(3750), expense(12000, "travel")]);
  const original = structuredClone({ data, input });
  const p = previewExpensePlan(data, input, "2026-10", " usd ");
  assert.equal(p.currency, "USD");
  assert.equal(p.recorded.expenseMinor, 65000);
  assert.equal(p.hypothetical.expenseMinor, 84500);
  assert.equal(p.plannedExpenseMinor, 19500);
  assert.equal(p.hypothetical.netMinor, 415500);
  assert.deepEqual(p.expenses.map(row => row.position), [1, 2, 3]);
  assert.deepEqual(p.budgets.map(row => [row.category, row.recordedRemainingMinor, row.hypotheticalRemainingMinor, row.hypotheticalOver]),
    [["food", 5000, -2500, true], ["travel", 10000, -2000, true]]);
  assert.deepEqual({ data, input }, original);
  assert.equal(JSON.stringify(p).includes("existing"), false);
});

test("native text normalization preserves historic spelling, notes and prototype names", () => {
  const p = previewExpensePlan(ledger([tx(2, " food ")]), plan([
    expense(3, " food ", { note: "\r\n  literal Ω <x> \0" }),
    expense(4, "__proto__"), expense(5, "constructor"),
    expense(6, "é"), expense(7, "e\u0301"),
  ]), "2026-10", "ZZZ");
  assert.equal(p.expenses[0].category, "food");
  assert.equal(p.expenses[0].note, "\r\n  literal Ω <x> \0");
  assert.equal(p.recorded.expenseMinor, 0);
  assert.equal(p.hypothetical.expenseMinor, 25);
  assert.deepEqual(p.categories.map(row => row.category), ["__proto__", "constructor", "e\u0301", "food", "é"]);
  const usd = previewExpensePlan(ledger([tx(2, " food ")]), plan([expense(3, " food ")]), "2026-10", "USD");
  assert.deepEqual(usd.categories.map(row => [row.category, row.hypotheticalExpenseMinor]), [[" food ", 2], ["food", 3]]);
});

test("missing, zero, equality and repeated legacy budgets stay distinct", () => {
  const p = previewExpensePlan(ledger([tx(2)], [budget("food", 5), budget("food", 9), budget("zero", 0)]),
    plan([expense(3), expense(1, "zero"), expense(4, "unbudgeted")]), "2026-10", "USD");
  assert.deepEqual(p.budgets.map(row => [row.position, row.limitMinor, row.hypotheticalRemainingMinor, row.hypotheticalOver]),
    [[1, 5, 0, false], [2, 9, 4, false], [3, 0, -1, true]]);
  assert.equal(p.categories.find(row => row.category === "unbudgeted")?.budgetCount, 0);
  assert.equal(p.budgets[0].currency, undefined);
});

test("actual legacy context must qualify before any additions", () => {
  for (const data of [
    ledger([], [budget()]),
    ledger([tx(2), tx(3, "food", { currency: "EUR" })], [budget()]),
  ]) {
    assert.throws(() => previewExpensePlan(data, plan([expense(4)]), "2026-10", "USD"), /budgets have no currency/);
  }
  assert.throws(() => previewExpensePlan(ledger([tx(1)], [budget()]), plan(), "2026-10", "EUR"), /budgets have no currency/);
});

test("invalid later item refuses the whole plan without changing the input", () => {
  const data = ledger([tx(2)]);
  const original = JSON.stringify(data);
  for (const bad of [expense(0), expense(-1), expense(1.5), expense(Number.MAX_SAFE_INTEGER + 1),
    expense(1, " "), expense(1, "food", { date: "2026-02-29" }),
    expense(1, "food", { date: "2026-11-01" }), expense(1, "food", { note: 42 })]) {
    assert.throws(() => previewExpensePlan(data, plan([expense(1), bad]), "2026-10", "USD"));
    assert.equal(JSON.stringify(data), original);
  }
});

test("plan identity and unsupported fields cannot become recording requests", () => {
  for (const key of ["type", "currency", "idempotencyKey", "id", "unexpected"]) {
    assert.throws(() => previewExpensePlan(ledger(), plan([expense(1, "food", { [key]: "value" })]), "2026-10", "USD"), /unsupported/);
  }
  for (const input of [null, [], {}, { schema: "other", expenses: [] },
    { ...plan(), extra: true }, { schema: "household-expense-plan/1", expenses: {} }]) {
    assert.throws(() => previewExpensePlan(ledger(), input, "2026-10", "USD"));
  }
});

test("safe total boundary is preserved in recorded and hypothetical summaries", () => {
  const p = previewExpensePlan(ledger([tx(Number.MAX_SAFE_INTEGER - 1)]), plan([expense(1)]), "2026-10", "USD");
  assert.equal(p.hypothetical.expenseMinor, Number.MAX_SAFE_INTEGER);
  assert.throws(() => previewExpensePlan(ledger([tx(Number.MAX_SAFE_INTEGER)]), plan([expense(1)]), "2026-10", "USD"), /safe integer/);
  assert.throws(() => previewExpensePlan(ledger(), plan([expense(Number.MAX_SAFE_INTEGER), expense(1)]), "2026-10", "USD"), /safe integer/);
});

test("complete native validation refuses unrelated malformed records and wrong selectors", () => {
  assert.throws(() => previewExpensePlan(ledger([tx(0, "other", { currency: "EUR", date: "2020-01-01" })]), plan(), "2026-10", "USD"), /positive integer/);
  for (const month of ["1969-12", "0000-01", "2026-13", "2026-1", undefined]) {
    assert.throws(() => previewExpensePlan(ledger(), plan(), month, "USD"));
  }
  for (const currency of [undefined, "", "US", "US1", 3]) {
    assert.throws(() => previewExpensePlan(ledger(), plan(), "2026-10", currency));
  }
  assert.equal(previewExpensePlan(ledger(), plan([{ ...expense(), date: "2024-02-29" }]), "2024-02", "zzz").currency, "ZZZ");
});

test("empty and maximum-size plans are whole comparisons, never prefixes", () => {
  const empty = previewExpensePlan(ledger([tx(2)]), plan(), "2026-10", "USD");
  assert.equal(empty.expenses.length, 0);
  assert.deepEqual(empty.recorded, empty.hypothetical);
  assert.equal(previewExpensePlan(ledger(), plan(Array.from({ length: MAX_EXPENSES }, () => expense())), "2026-10", "USD").expenses.length, MAX_EXPENSES);
  assert.throws(() => previewExpensePlan(ledger(), plan(Array.from({ length: MAX_EXPENSES + 1 }, () => expense())), "2026-10", "USD"), /at most/);
  const many = Array.from({ length: MAX_CATEGORIES + 1 }, (_, i) => budget(`c${i}`, 0, "USD"));
  assert.throws(() => previewExpensePlan(ledger([], many), plan(), "2026-10", "USD"), /categories/);
});

test("bounded UTF-8 parsing retains source identity and rejects malformed complete input", () => {
  const bytes = Buffer.from("\ufeff" + JSON.stringify(plan()), "utf8");
  assert.deepEqual(parseSnapshot(bytes, MAX_PLAN_BYTES, "plan"), plan());
  assert.equal(identifySnapshot("plan.json", bytes).bytes, bytes.length);
  for (const bytes of [Buffer.alloc(0), Buffer.from([0xc3, 0x28]), Buffer.from("{}x"), Buffer.alloc(MAX_PLAN_BYTES + 1, 32)]) {
    assert.throws(() => parseSnapshot(bytes, MAX_PLAN_BYTES, "plan"));
  }
});

test("static report keeps inspection data inert and distinguishes literal controls", () => {
  const p = previewExpensePlan(ledger([tx(2, "food", { note: "PRIVATE RECORDED NOTE" })]), plan([
    expense(1, "<script>", { note: "\nstart\r\n<&> Ω 😀" }),
    expense(1, "x\0", { note: "real\0nul" }),
    expense(1, "x\\u0000", { note: "literal\\u0000" }),
    expense(1, "lone\ud800"),
  ]), "2026-10", "USD");
  const html = renderExpensePlan(p, identity);
  assert.equal(html.includes("PRIVATE RECORDED NOTE"), false);
  assert.match(html, /<span>\nstart&#13;\n&lt;&amp;&gt; Ω 😀<\/span>/);
  assert.match(html, /JSON string notation/);
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("\0"), false);
  const raw = html.match(/<script type="application\/json" id="expense-plan-data">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(raw);
  assert.deepEqual(JSON.parse(raw).expenses, p.expenses);
  assert.equal(JSON.parse(raw).provenance.ledger.sha256, identity.ledger.sha256);
  assert.match(html, /@media print/);
  assert.equal(/<script(?! type="application\/json")|<link |<iframe|https?:\/\//.test(html), false);
});
