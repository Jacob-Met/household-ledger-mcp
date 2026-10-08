import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  compareLedgerSnapshot, renderMonthComparison,
  MAX_SNAPSHOT_BYTES, MAX_COMPARISON_CATEGORIES, MAX_REPORT_BYTES,
} from "../src/month-comparison.js";
import { monthlySummary, validateLedgerData } from "../src/ledger.js";
import type { LedgerData, Transaction } from "../src/ledger.js";

const options = { firstMonth: "2026-08", secondMonth: "2026-09", currency: "USD" };
let serial = 0;
function transaction(month: string, type: "income" | "expense", amountMinor: number, category: string, currency = "USD"): Transaction {
  return { id: "test-" + ++serial, type, amountMinor, currency, date: month + "-15", category, createdAt: "2026-10-08T00:00:00Z" };
}
function ledger(): LedgerData { return { version: 2, transactions: [], budgets: [] }; }
function encoded(data: LedgerData): Buffer { return Buffer.from(JSON.stringify(data), "utf8"); }
function compare(data: LedgerData) { return compareLedgerSnapshot(encoded(data), options); }

test("manual monthly and category amounts use the selected currency and complete snapshot", () => {
  const data = ledger();
  data.transactions = [
    transaction("2026-08", "income", 60000, "Work"),
    transaction("2026-08", "expense", 12000, "Food"),
    transaction("2026-09", "income", 50000, "Work"),
    transaction("2026-09", "expense", 15000, "Food"),
    transaction("2026-09", "income", 100000, "Other currency", "EUR"),
    transaction("2026-10", "expense", 999, "Later"),
  ];
  const result = compare(data);
  assert.deepEqual(result.totals, {
    first: { incomeMinor: 60000, expenseMinor: 12000, netMinor: 48000 },
    second: { incomeMinor: 50000, expenseMinor: 15000, netMinor: 35000 },
    change: { incomeMinor: "-10000", expenseMinor: "3000", netMinor: "-13000" },
  });
  assert.deepEqual(result.categories.map(row => row.category), ["Food", "Work"]);
  assert.equal(result.direction, "second-minus-first");
});

test("category union preserves reserved keys, raw spaces, income-only and budget-only categories", () => {
  const data = ledger();
  data.transactions = [
    transaction("2026-08", "expense", 3, "__proto__"),
    transaction("2026-08", "income", 7, "constructor"),
    transaction("2026-09", "expense", 5, "toString"),
    transaction("2026-08", "expense", 11, " Food "),
    transaction("2026-09", "expense", 13, "Food"),
  ];
  data.budgets.push({ category: "Only budget", month: "2026-08", limitMinor: 0, currency: "USD" });
  const result = compare(data);
  assert.deepEqual(result.categories.map(row => row.category),
    [" Food ", "Food", "Only budget", "__proto__", "constructor", "toString"]);
  assert.equal(result.categories.find(row => row.category === "__proto__")!.first.expenseMinor, 3);
  assert.equal(result.categories.find(row => row.category === "Only budget")!.first.budget!.limitMinor, 0);
  assert.equal(result.categories.find(row => row.category === "Only budget")!.second.budget, null);
});

test("wide net and remaining deltas are exact decimal strings and retain reverse month order", () => {
  const data = ledger();
  const maximum = Number.MAX_SAFE_INTEGER;
  data.transactions = [
    transaction("2026-08", "expense", maximum, "Shift"),
    transaction("2026-09", "income", maximum, "Shift"),
  ];
  data.budgets = [
    { category: "Shift", month: "2026-08", limitMinor: 0, currency: "USD" },
    { category: "Shift", month: "2026-09", limitMinor: maximum, currency: "USD" },
  ];
  const result = compare(data);
  assert.equal(result.totals.change.netMinor, "18014398509481982");
  assert.equal(result.categories[0].change.netMinor, "18014398509481982");
  assert.equal(result.categories[0].change.budgetRemainingMinor, "18014398509481982");
  const reversed = compareLedgerSnapshot(encoded(data), { ...options, firstMonth: "2026-09", secondMonth: "2026-08" });
  assert.equal(reversed.firstMonth, "2026-09");
  assert.equal(reversed.secondMonth, "2026-08");
  assert.equal(reversed.totals.change.netMinor, "-18014398509481982");
  assert.equal(reversed.categories[0].change.budgetRemainingMinor, "-18014398509481982");
});

test("missing and present zero budgets remain different and missing pair deltas are null", () => {
  const data = ledger();
  data.budgets = [
    { category: "Removed", month: "2026-08", limitMinor: 0, currency: "USD" },
    { category: "Added", month: "2026-09", limitMinor: 0, currency: "USD" },
    { category: "Paired", month: "2026-08", limitMinor: 50, currency: "USD" },
    { category: "Paired", month: "2026-09", limitMinor: 0, currency: "USD" },
  ];
  const result = compare(data);
  for (const name of ["Added", "Removed"]) {
    const row = result.categories.find(row => row.category === name)!;
    assert.equal(row.change.budgetLimitMinor, null);
    assert.equal(row.change.budgetSpentMinor, null);
    assert.equal(row.change.budgetRemainingMinor, null);
  }
  const paired = result.categories.find(row => row.category === "Paired")!;
  assert.equal(paired.second.budget!.limitMinor, 0);
  assert.equal(paired.change.budgetLimitMinor, "-50");
  assert.equal(paired.change.budgetRemainingMinor, "-50");
});

test("producer-valid duplicate legacy budgets refuse ambiguous pairing", () => {
  const data = ledger();
  data.version = 1;
  data.transactions = [
    transaction("2026-08", "expense", 1, "Legacy"),
    transaction("2026-09", "expense", 1, "Legacy"),
  ];
  data.budgets = [
    { category: "Legacy", month: "2026-08", limitMinor: 10 },
    { category: "Legacy", month: "2026-08", limitMinor: 20 },
  ];
  validateLedgerData(data);
  assert.equal(monthlySummary(data, 2026, 8, "USD").budgets.length, 2);
  assert.throws(() => compare(data), /multiple native budget rows/);
});

test("qualified legacy budget currency absence is retained and mixed or empty ambiguity still refuses", () => {
  const data = ledger();
  data.version = 1;
  data.transactions = [
    transaction("2026-08", "expense", 1, "Legacy"),
    transaction("2026-09", "expense", 2, "Legacy"),
  ];
  data.budgets = [{ category: "Legacy", month: "2026-08", limitMinor: 5 }];
  const result = compare(data);
  assert.equal(Object.hasOwn(result.categories[0].first.budget!, "currency"), false);
  assert.match(renderMonthComparison(result), /Legacy budget: stored currency absent/);
  data.transactions.push(transaction("2026-08", "expense", 1, "Other", "EUR"));
  assert.throws(() => compare(data), /no currency/);
  data.transactions = data.transactions.filter(row => !row.date.startsWith("2026-08"));
  assert.throws(() => compare(data), /no currency/);
});

test("whole-ledger validation includes transactions outside both selected months and currency", () => {
  const data = ledger();
  data.transactions = [transaction("2026-10", "expense", 1, "Outside", "EUR")];
  data.transactions[0].amountMinor = -1;
  assert.throws(() => compare(data), /positive integer/);
});

test("native unsafe monthly gross totals remain refused", () => {
  const data = ledger();
  data.transactions = [
    transaction("2026-08", "income", Number.MAX_SAFE_INTEGER, "Gross"),
    transaction("2026-08", "income", 1, "Gross"),
  ];
  assert.throws(() => compare(data), /monthly transaction totals exceed/);
});

test("UTF-8 BOM and a nonzero-offset byte view keep exact source identity", () => {
  const data = ledger();
  data.transactions = [transaction("2026-08", "expense", 1, "Café 日本語")];
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encoded(data)]);
  const enclosing = Buffer.concat([Buffer.from("prefix"), bytes, Buffer.from("suffix")]);
  const before = Buffer.from(enclosing);
  const view = enclosing.subarray(6, enclosing.length - 6);
  const result = compareLedgerSnapshot(view, options);
  assert.equal(result.source.bytes, bytes.length);
  assert.equal(result.source.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.deepEqual(enclosing, before);
});

test("invalid UTF-8, JSON, native month range, same month and currency refuse", () => {
  assert.throws(() => compareLedgerSnapshot(Buffer.from([0xc0, 0xaf]), options), /valid UTF-8/);
  assert.throws(() => compareLedgerSnapshot(Buffer.from("{} trailing"), options), /complete JSON/);
  assert.throws(() => compareLedgerSnapshot(encoded(ledger()), { ...options, firstMonth: "1969-12" }), /1970/);
  assert.throws(() => compareLedgerSnapshot(encoded(ledger()), { ...options, firstMonth: "2026-13" }), /YYYY-MM/);
  assert.throws(() => compareLedgerSnapshot(encoded(ledger()), { ...options, secondMonth: "2026-08" }), /distinct/);
  assert.throws(() => compareLedgerSnapshot(encoded(ledger()), { ...options, currency: "" }), /explicit/);
  assert.throws(() => compareLedgerSnapshot(encoded(ledger()), { ...options, currency: "USDE" }), /explicit/);
  const normalized = compareLedgerSnapshot(encoded(ledger()), { ...options, currency: " usd " });
  assert.equal(normalized.currency, "USD");
});

test("HTML contexts remain inert while embedded data and raw category spaces survive", () => {
  const data = ledger();
  const category = ' <img src=x onerror="alert(1)">&\'\r</script> ';
  data.transactions = [transaction("2026-08", "expense", 7, category)];
  const result = compareLedgerSnapshot(encoded(data), { ...options, sourceLabel: '<source>&"\'' });
  const html = renderMonthComparison(result);
  assert.equal(html.includes("<img"), false);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&amp;&#39;&#13;&lt;\/script&gt;/);
  assert.match(html, /&lt;source&gt;&amp;&quot;&#39;/);
  const match = html.match(/<script id="household-month-comparison-data" type="application\/json">([\s\S]*?)<\/script>/)!;
  assert.equal(JSON.parse(match[1]).categories[0].category, category);
  assert.match(html, /role="region" tabindex="0" aria-label="Category changes/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /@media print/);
});

test("unrenderable selected names refuse instead of silently replacing original code points", () => {
  for (const category of ["bad\u0000name", "bad\ud800name", "bad\udc00name"]) {
    const data = ledger();
    data.transactions = [transaction("2026-08", "expense", 1, category)];
    validateLedgerData(data);
    assert.throws(() => compare(data), /cannot be rendered losslessly/);
  }
});

test("complete snapshot and category bounds refuse without truncation", () => {
  assert.throws(() => compareLedgerSnapshot(new Uint8Array(0), options), /bytes/);
  assert.throws(() => compareLedgerSnapshot(new Uint8Array(MAX_SNAPSHOT_BYTES + 1), options), /bytes/);
  const data = ledger();
  for (let i = 0; i <= MAX_COMPARISON_CATEGORIES; i++) {
    data.transactions.push(transaction("2026-08", "expense", 1, "Category " + i));
  }
  assert.throws(() => compare(data), /complete categories/);
});

test("complete rendered report is bounded before the CLI can publish it", () => {
  const result = compare(ledger());
  result.source.label = "x".repeat(MAX_REPORT_BYTES);
  assert.throws(() => renderMonthComparison(result), /complete HTML report exceeds/);
});
