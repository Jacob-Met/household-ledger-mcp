import { test } from "node:test";
import assert from "node:assert/strict";
import { listTransactions, ValidationError, type LedgerData, type ListTransactionsFilter, type Transaction } from "../src/ledger.js";

function fixture(): LedgerData {
  const row = (id: string, date: string, note: string, type: "income" | "expense" = "expense", category = "food"): Transaction => ({
    id, date, note, type, category, amountMinor: 125, currency: "USD", createdAt: "2026-10-13T00:00:00Z",
  });
  const early = row("duplicate", "2026-10-01", "early Ω <&>");
  return { version: 1, budgets: [], transactions: [
    row("same", "2026-10-15", "middle A"), row("late", "2026-10-31", "late"), early,
    row("same", "2026-10-15", "middle B"), row("pay", "2026-10-01", "pay", "income", "pay"), early,
  ] };
}

test("default and explicit newest preserve rows, references, stable ties and input", () => {
  const data = fixture(), rows = [...data.transactions], before = JSON.stringify(data);
  const expected = [rows[1], rows[0], rows[3], rows[2], rows[4], rows[5]];
  for (const filter of [{}, { order: "newest" as const }, { order: undefined }]) {
    const result = listTransactions(data, filter);
    assert.deepEqual(result, { total: 6, transactions: expected });
    result.transactions.forEach((row, i) => assert.equal(row, expected[i]));
    assert.notEqual(result.transactions, data.transactions);
  }
  assert.deepEqual(data.transactions, rows);
  assert.equal(JSON.stringify(data), before);
});

test("oldest orders by date without reversing equal-date rows or collapsing occurrences", () => {
  const data = fixture(), rows = [...data.transactions], before = JSON.stringify(data);
  const result = listTransactions(data, { order: "oldest" });
  const expected = [rows[2], rows[4], rows[5], rows[0], rows[3], rows[1]];
  assert.deepEqual(result, { total: 6, transactions: expected });
  result.transactions.forEach((row, i) => assert.equal(row, expected[i]));
  assert.equal(result.transactions[0], result.transactions[2]);
  assert.equal(JSON.stringify(data), before);
  data.transactions.forEach((row, i) => assert.equal(row, rows[i]));
});

test("filters precede ordering and pagination; total counts all matching occurrences", () => {
  const data = fixture(), rows = data.transactions;
  const filter: ListTransactionsFilter = { type: "expense", category: "food", from: "2026-10-01", to: "2026-10-15", order: "oldest" };
  assert.deepEqual(listTransactions(data, { ...filter, offset: 1, limit: 2 }), { total: 4, transactions: [rows[5], rows[0]] });
  const paged = [0, 2].flatMap(offset => listTransactions(data, { ...filter, offset, limit: 2 }).transactions);
  assert.deepEqual(paged, [rows[2], rows[5], rows[0], rows[3]]);
  for (const extra of [{ limit: 0 }, { offset: 4 }, { offset: 99 }]) {
    assert.deepEqual(listTransactions(data, { ...filter, ...extra }), { total: 4, transactions: [] });
  }
  assert.deepEqual(listTransactions(data, { ...filter, category: "absent" }), { total: 0, transactions: [] });
});

test("only the two literal order choices are admitted, even with no matching rows", () => {
  for (const value of [null, true, false, 0, 1, "", "OLDEST", "oldest ", [], {}, ["oldest"]]) {
    for (const data of [fixture(), { version: 1, transactions: [], budgets: [] }]) {
      const before = JSON.stringify(data);
      assert.throws(() => listTransactions(data, { order: value } as unknown as ListTransactionsFilter), error => error instanceof ValidationError && error.message === "order must be newest|oldest");
      assert.equal(JSON.stringify(data), before);
    }
  }
});

test("date and pagination admission remain in force for either direction", () => {
  const data = fixture();
  for (const order of ["newest", "oldest"] as const) {
    assert.throws(() => listTransactions(data, { order, from: "2026-10-31", to: "2026-10-01", limit: 0 }), /from must be on or before to/);
    assert.throws(() => listTransactions(data, { order, from: "2026-02-30" }), /not a real calendar date/);
    assert.throws(() => listTransactions(data, { order, limit: -1 }), /limit must be an integer 0\.\.1000/);
    assert.throws(() => listTransactions(data, { order, offset: 0.5 }), /offset must be a non-negative integer/);
    assert.deepEqual(listTransactions(data, { order, from: "2026-10-15", to: "2026-10-15" }).transactions, [data.transactions[0], data.transactions[3]]);
  }
});
