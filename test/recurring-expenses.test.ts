import test from "node:test";
import assert from "node:assert/strict";
import { generateRecurringExpensePlan as generate } from "../src/recurring-expenses.js";
import { emptyLedger, recordTransaction, setBudget, ValidationError } from "../src/ledger.js";
import { previewExpensePlan } from "../src/expense-plan.js";

const rule = (extra: Record<string, unknown> = {}) => ({
  id: "rent", start: "2024-01-31", category: " Home ", amountMinor: 100,
  repeat: { unit: "month", every: 1, missingDay: "last" }, ...extra,
});
const input = (rules: unknown[], currency: unknown = " usd ") => ({
  schema: "household-recurring-expenses/1", currency, rules,
});
const dates = (result: ReturnType<typeof generate>) => result.plan.expenses.map(row => row.date);
const refused = (value: unknown, month = "2026-10") => assert.throws(() => generate(value, month), ValidationError);

test("weekly cadence retains its start weekday, interval and inclusive active dates", () => {
  const r = rule({ id: "weekly", start: "2026-10-02", end: "2026-10-16", repeat: { unit: "week", every: 2 } });
  assert.deepEqual(dates(generate(input([r]), "2026-10")), ["2026-10-02", "2026-10-16"]);
  assert.deepEqual(dates(generate(input([rule({ start: "2025-01-01", repeat: { unit: "week", every: 52 } })]), "2025-12")), ["2025-12-31"]);
  assert.deepEqual(dates(generate(input([rule({ start: "2026-03-01", repeat: { unit: "week", every: 1 } })]), "2026-03")),
    ["2026-03-01", "2026-03-08", "2026-03-15", "2026-03-22", "2026-03-29"]);
});
test("monthly slots clamp from the original day without drift and retain month cadence", () => {
  const source = input([rule()]);
  assert.deepEqual(dates(generate(source, "2024-02")), ["2024-02-29"]);
  assert.deepEqual(dates(generate(source, "2024-03")), ["2024-03-31"]);
  const everyOther = input([rule({ repeat: { unit: "month", every: 2, missingDay: "last" } })]);
  assert.deepEqual(dates(generate(everyOther, "2024-02")), []);
  assert.deepEqual(dates(generate(everyOther, "2024-03")), ["2024-03-31"]);
  assert.deepEqual(dates(generate(everyOther, "2024-05")), ["2024-05-31"]);
});
test("missing-day projection has no invented date and uses the last-day active boundary", () => {
  const base = { start: "2025-01-31", repeat: { unit: "month", every: 1, missingDay: "skip" } };
  assert.deepEqual(generate(input([rule({ ...base, end: "2025-02-27" })]), "2025-02").skipped, []);
  const result = generate(input([rule({ ...base, end: "2025-02-28" })]), "2025-02");
  assert.deepEqual(result.plan.expenses, []);
  assert.deepEqual(result.skipped, [{ ruleId: "rent", rulePosition: 1, month: "2025-02", requestedDay: 31, reason: "missing-day" }]);
});
test("calendar bounds include leap centuries and the final supported month", () => {
  assert.deepEqual(dates(generate(input([rule({ start: "2000-01-31" })]), "2000-02")), ["2000-02-29"]);
  assert.deepEqual(dates(generate(input([rule({ start: "2100-01-31" })]), "2100-02")), ["2100-02-28"]);
  assert.deepEqual(dates(generate(input([rule({ start: "9999-12-31" })]), "9999-12")), ["9999-12-31"]);
  assert.deepEqual(dates(generate(input([rule({ start: "1970-01-01" })]), "1970-01")), ["1970-01-01"]);
  refused(input([rule({ start: "1969-12-31" })]));
  refused(input([rule({ start: "2100-02-29" })]));
  refused(input([]), "10000-01");
});
test("date order then original occurrence order preserves identical rules with distinct IDs", () => {
  const result = generate(input([
    rule({ id: "z", start: "2026-10-15" }),
    rule({ id: "early", start: "2026-10-01" }),
    rule({ id: "a", start: "2026-10-15" }),
  ]), "2026-10");
  assert.deepEqual(result.occurrences, [
    { position: 1, ruleId: "early", rulePosition: 2, date: "2026-10-01" },
    { position: 2, ruleId: "z", rulePosition: 1, date: "2026-10-15" },
    { position: 3, ruleId: "a", rulePosition: 3, date: "2026-10-15" },
  ]);
  assert.equal(result.plan.expenses.length, 3);
  refused(input([rule(), rule()]));
});
test("native literal notes, category/currency normalization and deep immutability", () => {
  const literal = "\r\n\u0000\ud800<&>\n";
  const source = input([rule({ note: literal }), rule({ id: "empty", note: "" }), rule({ id: "absent" })]);
  const before = structuredClone(source);
  const result = generate(source, "2024-02");
  assert.equal(result.currency, "USD");
  assert.equal(result.plan.expenses[0].category, "Home");
  assert.equal(result.plan.expenses[0].note, literal);
  assert.equal(result.plan.expenses[1].note, "");
  assert.equal(Object.hasOwn(result.plan.expenses[2], "note"), false);
  function check(value: unknown) {
    if (value !== null && typeof value === "object") {
      assert.equal(Object.isFrozen(value), true);
      for (const child of Object.values(value)) check(child);
    }
  }
  check(result);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(source), false);
  assert.deepEqual(result, generate(source, "2024-02"));
  assert.throws(() => (result.plan.expenses as unknown as unknown[]).push({}), TypeError);
});
test("inactive rules still reject malformed domain and exact-key violations", () => {
  for (const extra of [
    { start: "9999-01-01", amountMinor: 0 }, { start: "9999-01-01", amountMinor: 1.1 },
    { start: "9999-01-01", category: " " }, { note: undefined }, { end: undefined }, { end: "2023-01-01" },
    { repeat: { unit: "week", every: 1, missingDay: "skip" } },
    { repeat: { unit: "month", every: 0, missingDay: "last" } },
    { repeat: { unit: "month", every: 121, missingDay: "last" } },
    { repeat: { unit: "month", every: 1 } }, { unexpected: 1 },
    { id: " padded" }, { id: "\u0000" }, { id: "\ud800" }, { id: "x".repeat(129) },
  ]) refused(input([rule(extra)]));
  refused({ ...input([]), surprise: true });
  refused(input([], "US"));
  refused(input(new Array(1)));
  refused(input([rule({ repeat: { unit: "week", every: true } })]));
});
test("safe integer total is checked after expansion, with no rounding or unrelated rule sum", () => {
  const max = rule({ start: "2026-10-01", end: "2026-10-01", amountMinor: Number.MAX_SAFE_INTEGER });
  assert.equal(generate(input([max]), "2026-10").plan.expenses[0].amountMinor, Number.MAX_SAFE_INTEGER);
  refused(input([max, rule({ id: "extra", start: "2026-10-01", amountMinor: 1 })]));
  assert.deepEqual(generate(input([max, rule({ id: "inactive", start: "9999-01-01", amountMinor: Number.MAX_SAFE_INTEGER })]), "2026-11").plan.expenses, []);
});
test("selected-month and byte/count bounds remain complete, including empty plans", () => {
  assert.deepEqual(generate(input([]), "2026-10").plan, { schema: "household-expense-plan/1", expenses: [] });
  const source = input(Array.from({ length: 100 }, (_, i) => rule({
    id: String(i), start: "2026-05-01", repeat: { unit: "week", every: 1 },
  })));
  assert.equal(generate(source, "2026-05").plan.expenses.length, 500);
  refused(input([...source.rules, rule({ id: "overflow" })]));
  refused(input([rule({ note: "x".repeat(1048576) })]));
  refused(input([rule({ start: "2026-05-01", repeat: { unit: "week", every: 1 }, note: "x".repeat(250000) })]), "2026-05");
});
test("the generated plan drives the unchanged native budget comparison without recording", () => {
  const ledger = emptyLedger();
  recordTransaction(ledger, { type: "expense", date: "2026-10-01", category: "Food", currency: "USD", amountMinor: 100 });
  setBudget(ledger, "Food", "2026-10", 400, "USD");
  const before = structuredClone(ledger);
  const source = input([rule({ category: " Food ", start: "2026-10-05", end: "2026-10-19", repeat: { unit: "week", every: 1 } })]);
  const result = generate(source, "2026-10");
  const equal = previewExpensePlan(ledger, result.plan, result.month, result.currency);
  assert.equal(equal.hypothetical.expenseMinor, 400);
  assert.equal(equal.budgets[0].hypotheticalOver, false);
  const over = generate(input([rule({ category: "Food", start: "2026-10-05", repeat: { unit: "week", every: 1 } })]), "2026-10");
  assert.equal(previewExpensePlan(ledger, over.plan, over.month, over.currency).budgets[0].hypotheticalOver, true);
  assert.deepEqual(ledger, before);
});

test("public API rejects non-JSON primitives and arrays before serialization or iteration", () => {
  for (const value of [1n, Symbol("bad"), undefined, null, {}, () => "date"]) {
    assert.throws(() => generate(input([]), value), ValidationError);
    refused(input([rule({ start: value })]));
    refused(input([rule({ end: value })]));
    refused(input([rule({ amountMinor: value })]));
  }
  const customJson = [rule()];
  Object.assign(customJson, { toJSON: () => [] });
  refused(input(customJson));
  const iterator = [rule()];
  Object.defineProperty(iterator, Symbol.iterator, { value: function* () { yield rule({ amountMinor: 7 }); } });
  refused(input(iterator));
  const prototype = [rule()];
  Object.setPrototypeOf(prototype, Object.create(Array.prototype));
  refused(input(prototype));
  let reads = 0;
  const accessor = [rule()];
  Object.defineProperty(accessor, "0", { enumerable: true, get() { reads++; return rule(); } });
  refused(input(accessor));
  assert.equal(reads, 0);
  const literal = rule({ note: "\u0000\ud800\r\n" });
  Object.freeze(literal.repeat); Object.freeze(literal);
  const frozen = input(Object.freeze([literal]) as unknown as unknown[]);
  Object.freeze(frozen);
  assert.equal(generate(frozen, "2026-10").plan.expenses[0].note, "\u0000\ud800\r\n");
});

test("proxy input is refused before any trap, including revoked proxies", () => {
  for (const placement of ["root", "array", "rule", "repeat"]) {
    const value = input([rule()]);
    let traps = 0;
    const proxy = <T extends object>(target: T) => new Proxy(target, {
      get(target, key, receiver) { traps++; return Reflect.get(target, key, receiver); },
      getPrototypeOf(target) { traps++; return Reflect.getPrototypeOf(target); },
      ownKeys(target) { traps++; return Reflect.ownKeys(target); },
      getOwnPropertyDescriptor(target, key) { traps++; return Reflect.getOwnPropertyDescriptor(target, key); },
    });
    let candidate: unknown = value;
    if (placement === "root") candidate = proxy(value);
    if (placement === "array") value.rules = proxy(value.rules);
    if (placement === "rule") value.rules[0] = proxy(value.rules[0] as object);
    if (placement === "repeat") (value.rules[0] as { repeat: object }).repeat = proxy((value.rules[0] as { repeat: object }).repeat);
    refused(candidate);
    assert.equal(traps, 0, placement);
  }
  const root = Proxy.revocable(input([]), {}); root.revoke();
  refused(root.proxy);
  const array = Proxy.revocable([rule()], {}); array.revoke();
  refused(input(array.proxy));
});
