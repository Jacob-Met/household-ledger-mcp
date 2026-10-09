import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LedgerStore, setBudget } from "../src/ledger.js";
import { previewBudgetReallocation } from "../src/budget-reallocation.js";
import { admittedBudgets, admittedReview, explicitCurrency, positiveMinorDigits, reallocationEndpoint, reallocationPreview, terminalLiteral } from "../src/reallocation-client.js";

test("explicit loopback endpoint and integer minor-unit admission", () => {
  assert.equal(reallocationEndpoint("http://127.0.0.1:3000/mcp"), "http://127.0.0.1:3000/mcp");
  assert.equal(reallocationEndpoint("http://[::1]:3000/mcp"), "http://[::1]:3000/mcp");
  for (const url of ["https://127.0.0.1/mcp", "http://localhost/mcp", "http://example.com/mcp", "http://u:p@127.0.0.1/mcp", "http://127.0.0.1/mcp?x", "http://127.0.0.1/mcp#x"])
    assert.throws(() => reallocationEndpoint(url));
  assert.equal(explicitCurrency(" jpy "), "JPY");
  assert.equal(positiveMinorDigits("2500"), 2500);
  assert.equal(positiveMinorDigits("9007199254740991"), Number.MAX_SAFE_INTEGER);
  for (const x of ["0", "-1", "1.25", "1e3", " 1", "1 ", "9007199254740992", ""]) assert.throws(() => positiveMinorDigits(x));
});
test("literal numbered budget data keeps names distinct; ambiguous/scope/unsafe rows refuse", () => {
  const rows = [
    { month: "2026-10", currency: "USD", category: " food ", limitMinor: 12000 },
    { month: "2026-10", currency: "usd", category: "food", limitMinor: 3300 },
    { month: "2026-10", currency: "USD", category: "__proto__\n\u001b[31m\u202e", limitMinor: 0 },
  ];
  assert.deepEqual(admittedBudgets(rows, "2026-10", "USD"), rows);
  for (const bad of [[...rows, rows[0]], [{ ...rows[0], currency: undefined }], [{ ...rows[0], currency: "EUR" }],
    [{ ...rows[0], month: "2026-11" }], [{ ...rows[0], limitMinor: Number.MAX_SAFE_INTEGER + 1 }]])
    assert.throws(() => admittedBudgets(bad, "2026-10", "USD"));
  const text = terminalLiteral(rows[2].category);
  assert.equal(text.includes("\n"), false); assert.equal(text.includes("\u001b"), false); assert.equal(text.includes("\u202e"), false);
  assert.match(text, /\\u202e/); assert.equal(JSON.parse(text), rows[2].category);
});
test("real producer review is completely displayed/admitted and altered content is refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "reallocation-client-domain-"));
  try {
    const store = new LedgerStore(join(dir, "ledger.json"));
    await store.update(data => {
      setBudget(data, " food ", "2026-10", 12000, "USD");
      setBudget(data, "交通\n\u202e", "2026-10", 3300, "USD");
      // setBudget normalizes new names; this fixture represents an existing literal stored name.
      data.budgets[0].category = " food ";
    });
    const input = { month: "2026-10", currency: "USD", fromCategory: " food ", toCategory: "交通\n\u202e", amountMinor: 2500 };
    const review = await previewBudgetReallocation(store, input);
    assert.equal(review.from.afterMinor, 9500); assert.equal(review.to.afterMinor, 5800); assert.equal(review.totalMinor, 15300);
    assert.deepEqual(admittedReview(review, input), review);
    const view = reallocationPreview("http://127.0.0.1:3000/mcp", review);
    for (const [key, value] of Object.entries(review)) assert.ok(view.includes(key + ": " + terminalLiteral(value)));
    for (const mutate of [
      (r: any) => { r.amountMinor += 1; }, (r: any) => { r.currency = "EUR"; }, (r: any) => { r.month = "2026-11"; },
      (r: any) => { r.from.category = "food"; }, (r: any) => { r.from.afterMinor += 1; },
      (r: any) => { r.to.beforeMinor = -1; }, (r: any) => { r.totalMinor = Number.MAX_SAFE_INTEGER + 1; },
      (r: any) => { r.reviewToken = "0".repeat(64); }, (r: any) => { r.extra = true; },
    ]) { const changed = structuredClone(review); mutate(changed); assert.throws(() => admittedReview(changed, input)); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
