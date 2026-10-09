import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildTransactionPrint, PRINT_LIMITS, type PrintOptions } from "../src/transaction-print.js";
const options: PrintOptions = { sourceName: "authored ledger.json", from: "2026-10-01", to: "2026-10-31" };
const row = (extra: Record<string, unknown> = {}) => ({ id: "same", type: "expense", amountMinor: 1250, currency: "USD", date: "2026-10-05", category: "food", ...extra });
const source = (rows: unknown[], extra = {}) => Buffer.from(JSON.stringify({ version: 2, transactions: rows, budgets: [], ...extra }));
const render = (rows: unknown[], opts: Partial<PrintOptions> = {}) => buildTransactionPrint(source(rows), { ...options, ...opts });
const unescape = (text: string) => text.replace(/&#13;/g, "\r").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
const records = (html: string) => [...html.matchAll(/<pre class="record-json">([\s\S]*?)<\/pre>/g)].map(m => JSON.parse(unescape(m[1])));
test("native order, inclusive range, stable tied rows and repeated IDs remain distinct", () => {
  const rows = [row({ date: "2026-10-01", note: "first" }), row({ date: "2026-09-30" }), row({ date: "2026-10-31", note: "last" }), row({ date: "2026-10-01", note: "second" }), row({ date: "2026-11-01" })];
  const result = render(rows);
  assert.deepEqual(result.summary.sourcePositions, [3, 1, 4]);
  assert.deepEqual(records(result.html), [rows[2], rows[0], rows[3]]);
});
test("exact category and type selectors retain case and whitespace", () => {
  const rows = [row({ category: " Food " }), row({ category: "Food", type: "income" }), row({ category: "food" })];
  assert.deepEqual(render(rows, { category: " Food " }).summary.sourcePositions, [1]);
  assert.deepEqual(render(rows, { category: "Food", type: "income" }).summary.sourcePositions, [2]);
  assert.equal(render(rows, { category: " " }).summary.matchedRows, 0);
  assert.equal(render(rows, { category: "Food", type: "expense" }).summary.matchedRows, 0);
});
test("every native page is included, beyond default50 and page1000", () => {
  const rows = Array.from({ length: 2001 }, (_, i) => row({ id: String(i) }));
  const result = render(rows);
  assert.equal(result.summary.matchedRows, 2001);
  assert.deepEqual(result.summary.sourcePositions, Array.from({ length: 2001 }, (_, i) => i + 1));
  assert.equal(records(result.html).length, 2001);
});
test("5000 rows accepted,5001 refuses the whole selection", () => {
  assert.equal(render(Array.from({ length: 5000 }, () => row())).summary.matchedRows, 5000);
  assert.throws(() => render(Array.from({ length: 5001 }, () => row())), /5000/);
});
test("literal safe integer, original currency/category and all metadata are preserved without totals", () => {
  const rows = [row({ amountMinor: Number.MAX_SAFE_INTEGER, currency: " usd ", category: " Food ", createdAt: { arbitrary: [null, true, "not a timestamp"] }, extra: { "__not_special": "retained" } }), row({ currency: "EUR", amountMinor: 1 })];
  const result = render(rows);
  assert.deepEqual(records(result.html), rows);
  assert.match(result.html, />9007199254740991<\/dd>/);
  assert.match(result.html, /> usd <\/dd>/);
  assert.doesNotMatch(result.html, /data-field="(?:total|balance|converted)/);
});
test("missing and empty note/createdAt differ; injection remains literal", () => {
  const rows = [row(), row({ note: "", createdAt: "" }), row({ note: '<script>alert("x")</script> & café\nnext\tcell\rreturn', createdAt: null })];
  const result = render(rows);
  assert.deepEqual(records(result.html), rows);
  assert.match(result.html, /data-presence="missing"/);
  assert.match(result.html, /data-presence="empty"/);
  assert.doesNotMatch(result.html, /<script/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.match(result.html, /&#13;return/);
});
test("parsed metadata negative zero and unusual own keys survive", () => {
  const bytes = Buffer.from('{"version":2,"budgets":[],"transactions":[{"id":"__proto__","type":"expense","amountMinor":1,"currency":"USD","date":"2026-10-05","category":"constructor","createdAt":{"zero":-0,"nested":[-0],"__proto__":"literal"}}]}');
  const r = records(buildTransactionPrint(bytes, options).html)[0];
  assert.equal(Object.is(r.createdAt.zero, -0), true);
  assert.equal(Object.is(r.createdAt.nested[0], -0), true);
  assert.equal(r.createdAt.__proto__, "literal");
});
test("empty selection is a complete document with explicit scope and provenance", () => {
  const bytes = source([]);
  const result = buildTransactionPrint(bytes, options);
  assert.equal(result.summary.sourceSha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.summary.sourceBytes, bytes.length);
  assert.match(result.html, /No entries match these exact selectors/);
  assert.match(result.html, /2026-10-01 through 2026-10-31/);
  assert.equal(records(result.html).length, 0);
});
test("source bytes remain exactly unchanged and output is deterministic", () => {
  const bytes = source([row()]);
  const before = Buffer.from(bytes);
  assert.deepEqual(buildTransactionPrint(bytes, options), buildTransactionPrint(bytes, options));
  assert.deepEqual(bytes, before);
});
test("invalid and inverted dates/type/empty category refuse", () => {
  for (const delta of [{ from: "2026-02-30" }, { to: "2026-09-30" }, { type: "transfer" }, { category: "" }, { sourceName: "" }]) {
    assert.throws(() => render([row()], delta as Partial<PrintOptions>));
  }
});
test("native ledger validation is complete, including invalid unselected rows/budgets", () => {
  assert.throws(() => render([row(), row({ date: "2026-09-30", amountMinor: 0 })]), /positive/);
  assert.throws(() => buildTransactionPrint(source([row()], { budgets: [{ category: "x", month: "2026-10", limitMinor: -1 }] }), options));
});
test("source exact byte limit admitted and overflow refused", () => {
  const bytes = source([]);
  const exact = Buffer.concat([bytes, Buffer.alloc(PRINT_LIMITS.sourceBytes - bytes.length, 32)]);
  assert.equal(buildTransactionPrint(exact, options).summary.sourceBytes, PRINT_LIMITS.sourceBytes);
  assert.throws(() => buildTransactionPrint(Buffer.concat([exact, Buffer.from(" ")]), options), /4 MiB/);
});
test("strict UTF8, syntax and nonfinite parsed JSON refuse", () => {
  assert.throws(() => buildTransactionPrint(Buffer.from([0xff]), options));
  assert.throws(() => buildTransactionPrint(Buffer.from("{"), options));
  assert.throws(() => buildTransactionPrint(Buffer.from('{"version":2,"budgets":[],"transactions":[],"extra":1e400}'), options), /finite/);
});
test("selected controls and isolated surrogates refuse without replacement", () => {
  for (const value of ["a\0b", "a\u000bb", "\ud800", "\udfff", "\u0085"]) assert.throws(() => render([row({ note: value })]), /control|surrogate/);
  assert.equal(render([row({ date: "2026-09-30", note: "\0" })]).summary.matchedRows, 0);
});
test("all selected metadata keys/values are checked, supplementary Unicode accepted", () => {
  assert.throws(() => render([row({ extra: { ["bad\0key"]: "x" } })]), /control/);
  assert.deepEqual(records(render([row({ note: "🧾 café 漢字" })]).html)[0].note, "🧾 café 漢字");
});
test("depth, node and complete rendered-byte limits refuse without a prefix", () => {
  let deep: unknown = 0; for (let i = 0; i < 40; i++) deep = [deep];
  assert.throws(() => render([row({ extra: deep })]), /depth/);
  assert.throws(() => buildTransactionPrint(source([], { extra: Array(100001).fill(0) }), options), /node/);
  assert.throws(() => render([row({ note: "&".repeat(900000) })]), /8 MiB/);
});
test("static output has no executable script, external dependency, forms or hidden record details", () => {
  const html = render([row({ note: "Visible print note" })]).html;
  assert.doesNotMatch(html, /<(?:script|iframe|form|link|img|details)\b/i);
  assert.match(html, /default-src &#39;none&#39;|default-src 'none'/);
  assert.match(html, /@media print/);
  assert.match(html, /Visible print note/);
});
