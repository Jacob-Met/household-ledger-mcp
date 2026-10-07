import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LedgerStore,
  ValidationError,
  emptyLedger,
  getBudgets,
  listTransactions,
  monthlySummary,
  recordTransaction,
  setBudget,
  validateDate,
  validateLedgerData,
  validateMonth,
  type LedgerData,
} from "../src/ledger.js";

describe("validation", () => {
  it("accepts real calendar dates, rejects impossible ones", () => {
    assert.equal(validateDate("2026-02-28"), "2026-02-28");
    assert.throws(() => validateDate("2026-02-30"), ValidationError);
    assert.throws(() => validateDate("2026-13-01"), ValidationError);
    assert.throws(() => validateDate("not-a-date"), ValidationError);
    assert.throws(() => validateDate("2026-2-3"), ValidationError);
  });

  it("validates months as YYYY-MM", () => {
    assert.equal(validateMonth("2026-10"), "2026-10");
    assert.throws(() => validateMonth("2026-13"), ValidationError);
    assert.throws(() => validateMonth("2026-1"), ValidationError);
  });

  it("rejects non-positive or fractional amounts", () => {
    const d = emptyLedger();
    assert.throws(
      () => recordTransaction(d, { type: "expense", amountMinor: 0, currency: "USD", date: "2026-10-01", category: "food" }),
      ValidationError
    );
    assert.throws(
      () => recordTransaction(d, { type: "expense", amountMinor: 12.5, currency: "USD", date: "2026-10-01", category: "food" }),
      ValidationError
    );
    assert.throws(
      () => recordTransaction(d, { type: "expense", amountMinor: -100, currency: "USD", date: "2026-10-01", category: "food" }),
      ValidationError
    );
    assert.throws(
      () => recordTransaction(d, { type: "bogus" as never, amountMinor: 100, currency: "USD", date: "2026-10-01", category: "food" }),
      ValidationError
    );
  });

  it("normalizes currency codes and rejects bad ones", () => {
    const d = emptyLedger();
    const tx = recordTransaction(d, { type: "income", amountMinor: 100, currency: "usd", date: "2026-10-01", category: "pay" });
    assert.equal(tx.currency, "USD");
    assert.throws(
      () => recordTransaction(d, { type: "income", amountMinor: 100, currency: "USDD", date: "2026-10-01", category: "pay" }),
      ValidationError
    );
  });

  it("rejects a corrupt ledger file on validate", () => {
    assert.throws(() => validateLedgerData({ version: 999, transactions: [], budgets: [] }), ValidationError);
    assert.throws(
      () => validateLedgerData({ version: 1, transactions: [{ id: "x" }], budgets: [] }),
      ValidationError
    );
  });
});

describe("transactions", () => {
  let data: LedgerData;
  beforeEach(() => {
    data = emptyLedger();
    recordTransaction(data, { type: "income", amountMinor: 500000, currency: "USD", date: "2026-10-01", category: "salary" });
    recordTransaction(data, { type: "expense", amountMinor: 12000, currency: "USD", date: "2026-10-05", category: "groceries" });
    recordTransaction(data, { type: "expense", amountMinor: 3000, currency: "USD", date: "2026-09-28", category: "groceries" });
  });

  it("lists newest-first with filters", () => {
    const all = listTransactions(data);
    assert.equal(all.total, 3);
    assert.equal(all.transactions[0].date, "2026-10-05");
    const sept = listTransactions(data, { from: "2026-09-01", to: "2026-09-30" });
    assert.equal(sept.total, 1);
    const exp = listTransactions(data, { type: "expense" });
    assert.equal(exp.total, 2);
    const paged = listTransactions(data, { limit: 1, offset: 1 });
    assert.equal(paged.transactions.length, 1);
    assert.equal(paged.total, 3);
  });

  it("summarizes a month with per-category totals", () => {
    const s = monthlySummary(data, 2026, 10);
    assert.equal(s.incomeMinor, 500000);
    assert.equal(s.expenseMinor, 12000);
    assert.equal(s.netMinor, 488000);
    assert.equal(s.byCategory["groceries"].expenseMinor, 12000);
    assert.equal(s.byCategory["salary"].incomeMinor, 500000);
  });
});

describe("budgets", () => {
  it("tracks spend vs limit and flags overruns", () => {
    const data = emptyLedger();
    recordTransaction(data, { type: "expense", amountMinor: 12000, currency: "USD", date: "2026-10-05", category: "groceries" });
    setBudget(data, "groceries", "2026-10", 10000);
    const s = monthlySummary(data, 2026, 10);
    assert.equal(s.budgets.length, 1);
    assert.equal(s.budgets[0].spentMinor, 12000);
    assert.equal(s.budgets[0].remainingMinor, -2000);
    assert.equal(s.budgets[0].over, true);

    const again = setBudget(data, "groceries", "2026-10", 20000);
    assert.equal(again.limitMinor, 20000);
    assert.equal(getBudgets(data, "2026-10").length, 1);
  });

  it("allows zero budgets and rejects negative limits", () => {
    const data = emptyLedger();
    setBudget(data, "fun", "2026-10", 0);
    assert.throws(() => setBudget(data, "fun", "2026-10", -1), ValidationError);
  });
});

describe("persistence", () => {
  it("round-trips through the data file and recovers empty for a missing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hlm-"));
    try {
      const store = new LedgerStore(join(dir, "sub", "ledger.json"));
      const loaded = await store.load();
      assert.deepEqual(loaded, emptyLedger());

      const data = emptyLedger();
      recordTransaction(data, { type: "expense", amountMinor: 500, currency: "USD", date: "2026-10-07", category: "coffee" });
      setBudget(data, "coffee", "2026-10", 3000);
      await store.save(data);

      const reloaded = await store.load();
      assert.equal(reloaded.transactions.length, 1);
      assert.equal(reloaded.budgets.length, 1);
      assert.equal(reloaded.transactions[0].category, "coffee");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refuses to load a corrupted file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "hlm-"));
    try {
      const { writeFile } = await import("node:fs/promises");
      const p = join(dir, "ledger.json");
      await writeFile(p, "{not json", "utf8");
      const store = new LedgerStore(p);
      await assert.rejects(() => store.load());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
