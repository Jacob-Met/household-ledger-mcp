import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LedgerStore, emptyLedger, recordTransaction, setBudget, ValidationError, type LedgerData } from "../src/ledger.js";
import { MAX_IMPORT_BYTES, MAX_IMPORT_FIELD_BYTES, MAX_IMPORT_ROWS, parseTransactionCsv } from "../src/transaction-csv.js";
import { commitTransactionImport, previewTransactionImport } from "../src/transaction-import.js";

const HEADERS = ["idempotencyKey", "type", "amountMinor", "currency", "date", "category"];
const quote = (value: string): string => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
function row(key = "bank:checking:1", changes: Record<string, string> = {}): Record<string, string> {
  return { idempotencyKey: key, type: "expense", amountMinor: "1234", currency: "usd", date: "2026-10-01", category: " food ", ...changes };
}
function csv(rows: Record<string, string>[], headers = HEADERS): string {
  return [headers.join(","), ...rows.map(value => headers.map(header => quote(value[header] ?? "")).join(","))].join("\n");
}
class ObservedStore extends LedgerStore {
  saves = 0;
  updates = 0;
  failNext = false;
  override async save(data: LedgerData): Promise<void> {
    this.saves++;
    if (this.failNext) { this.failNext = false; throw new Error("injected persistence failure"); }
    return super.save(data);
  }
  override async update<T>(mutate: (data: LedgerData) => T | Promise<T>): Promise<T> {
    this.updates++;
    return super.update(mutate);
  }
}
async function fixture(t: TestContext): Promise<{ path: string; store: ObservedStore }> {
  const directory = await mkdtemp(join(tmpdir(), "hlm-import-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "ledger.json");
  return { path, store: new ObservedStore(path) };
}
async function approved(store: LedgerStore, source: string): Promise<{ csv: string; reviewToken: string }> {
  const result = await previewTransactionImport(store, { csv: source });
  assert.equal(result.canCommit, true);
  assert.equal(typeof result.reviewToken, "string");
  return { csv: source, reviewToken: result.reviewToken! };
}

test("CSV preserves quoted Unicode notes and physical row pointers while normalizing native fields", () => {
  const note = '  café, "rent"\r\npaid\t  ';
  const headers = ["note", ...[...HEADERS].reverse()];
  const parsed = parseTransactionCsv("\uFEFF" + csv([row("source:α", { amountMinor: "001234", currency: " usd ", note }), row("source:β", { note: "" })], headers));
  assert.deepEqual(parsed.rows[0], { line: 2, input: {
    idempotencyKey: "source:α", type: "expense", amountMinor: 1234, currency: "USD", date: "2026-10-01", category: "food", note,
  } });
  assert.equal(parsed.rows[1].line, 4);
  assert.equal(parsed.rows[1].input.note, "");
  assert.match(parsed.sourceSha256, /^[0-9a-f]{64}$/);
});

test("CSV distinguishes an absent optional note from an explicitly empty native note", () => {
  assert.equal(Object.hasOwn(parseTransactionCsv(csv([row()])).rows[0].input, "note"), false);
  assert.equal(parseTransactionCsv(csv([row()], [...HEADERS, "note"])).rows[0].input.note, "");
  assert.equal(parseTransactionCsv(csv([row("😀".repeat(128))])).rows[0].input.idempotencyKey, "😀".repeat(128));
  assert.throws(() => parseTransactionCsv(csv([row("😀".repeat(129))])), ValidationError);
});

test("CSV admits only explicit native positive exact amounts, dates, currencies, categories and keys", () => {
  const invalid: Record<string, string>[] = [
    { amountMinor: "0" }, { amountMinor: "-1" }, { amountMinor: "+1" }, { amountMinor: "1.00" },
    { amountMinor: "1e3" }, { amountMinor: "1,000" }, { amountMinor: " 1" }, { amountMinor: "9007199254740992" },
    { date: "2026-02-29" }, { date: "2026-04-31" }, { date: "2026-1-01" }, { date: "" },
    { currency: "US" }, { currency: "U1D" }, { type: "refund" }, { category: " " },
    { idempotencyKey: "" }, { idempotencyKey: " source" }, { idempotencyKey: "source " },
  ];
  for (const value of invalid) assert.throws(() => parseTransactionCsv(csv([row("source", value)])), ValidationError, JSON.stringify(value));
  assert.equal(parseTransactionCsv(csv([row("max", { amountMinor: String(Number.MAX_SAFE_INTEGER), date: "2024-02-29" })])).rows[0].input.amountMinor, Number.MAX_SAFE_INTEGER);
});

test("CSV refuses missing, duplicate and unsupported headers instead of dropping user fields", () => {
  for (const header of HEADERS) assert.throws(() => parseTransactionCsv(csv([row()], HEADERS.filter(value => value !== header))), /requires/);
  for (const header of ["id", "createdAt", "memo", "source", "Currency"]) {
    assert.throws(() => parseTransactionCsv(csv([row("a", { [header]: "retain me" })], [...HEADERS, header])), /unsupported fields are not discarded/);
  }
  assert.throws(() => parseTransactionCsv(csv([row()], [...HEADERS, "type"])), /must not repeat/);
});

test("CSV refuses malformed quoting, blank records and ragged widths", () => {
  for (const source of [
    HEADERS.join(",") + '\na,expense,1,USD,2026-10-01,"unterminated',
    HEADERS.join(",") + '\na,expense,1,USD,2026-10-01,"x"ignored',
    HEADERS.join(",") + '\na,expense,1,USD,2026-10-01,bad"quote',
    csv([row()]) + "\n\n", csv([row()]) + ",unexpected", HEADERS.join(",") + "\na,expense,1",
  ]) assert.throws(() => parseTransactionCsv(source), ValidationError, source);
  assert.equal(parseTransactionCsv(csv([row()]) + "\r\n").rows.length, 1);
  assert.throws(() => parseTransactionCsv(""), /header/);
});

test("CSV enforces UTF-8, whole-input, field and transaction-count bounds", () => {
  assert.throws(() => parseTransactionCsv(csv([row("bad\uD800")])), /invalid Unicode/);
  assert.throws(() => parseTransactionCsv("x".repeat(MAX_IMPORT_BYTES + 1)), /UTF-8 bytes/);
  for (const note of ["x".repeat(MAX_IMPORT_FIELD_BYTES), "é".repeat(MAX_IMPORT_FIELD_BYTES / 2)]) {
    assert.equal(parseTransactionCsv(csv([row("bounded", { note })], [...HEADERS, "note"])).rows[0].input.note, note);
    assert.throws(() => parseTransactionCsv(csv([row("large", { note: note + "é" })], [...HEADERS, "note"])), /field exceeds/);
  }
  assert.equal(parseTransactionCsv(csv(Array.from({ length: MAX_IMPORT_ROWS }, (_, index) => row(`row:${index}`)))).rows.length, MAX_IMPORT_ROWS);
  assert.throws(() => parseTransactionCsv(csv(Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, index) => row(`row:${index}`)))), /at most 500/);
});

test("CSV refuses repeated logical source identities even when their values are identical", () => {
  for (const second of [row("same"), row("same", { amountMinor: "10" })]) {
    assert.throws(() => parseTransactionCsv(csv([row("same"), second])), /repeated idempotencyKey/);
  }
});

test("preview shows exact normalized input without creating the ledger or speculative IDs", async t => {
  const { store, path } = await fixture(t);
  const source = csv([row("first", { currency: " usd ", note: "  exact\r\n" })], [...HEADERS, "note"]);
  const result = await previewTransactionImport(store, { csv: source });
  assert.equal(result.canCommit, true);
  assert.deepEqual(result.counts, { total: 1, add: 1, alreadyRecorded: 0, conflict: 0 });
  assert.deepEqual(result.rows[0].input, parseTransactionCsv(source).rows[0].input);
  assert.equal(Object.hasOwn(result.rows[0], "existingTransaction"), false);
  assert.equal(Object.hasOwn(result.rows[0].input, "id"), false);
  assert.equal(Object.hasOwn(result.rows[0].input, "createdAt"), false);
  assert.deepEqual(result.totals, { allRows: [{ currency: "USD", incomeMinor: 0, expenseMinor: 1234, netMinor: -1234 }], additions: [{ currency: "USD", incomeMinor: 0, expenseMinor: 1234, netMinor: -1234 }] });
  assert.equal(store.saves, 0);
  assert.equal(store.updates, 0);
  await assert.rejects(readFile(path), { code: "ENOENT" });
});

test("header-only preview is noncommittable and all admission failures leave storage absent", async t => {
  const { store, path } = await fixture(t);
  const empty = csv([]);
  assert.deepEqual((await previewTransactionImport(store, { csv: empty })).counts, { total: 0, add: 0, alreadyRecorded: 0, conflict: 0 });
  assert.equal((await previewTransactionImport(store, { csv: empty })).reviewToken, null);
  await assert.rejects(commitTransactionImport(store, { csv: empty, reviewToken: "0".repeat(64) }), /no transaction rows/);
  await assert.rejects(previewTransactionImport(store, { csv: csv([row("first"), row("bad", { amountMinor: "1.5" })]) }), ValidationError);
  assert.equal(store.updates, 0);
  assert.equal(store.saves, 0);
  await assert.rejects(readFile(path), { code: "ENOENT" });
});

test("one batch commits once and its records contain exactly the reviewed normalized values", async t => {
  const { store } = await fixture(t);
  const source = csv([row("one", { note: "  memo retained  " }), row("two", { currency: "EUR", type: "income", amountMinor: "00200", note: "" })], [...HEADERS, "note"]);
  const preview = await previewTransactionImport(store, { csv: source });
  const result = await commitTransactionImport(store, { csv: source, reviewToken: preview.reviewToken });
  assert.equal(store.updates, 1);
  assert.equal(store.saves, 1);
  assert.equal(result.added, 2);
  assert.equal(result.alreadyRecorded, 0);
  assert.deepEqual(result.totals, preview.totals.additions);
  for (let index = 0; index < result.transactions.length; index++) {
    const { id, createdAt, ...input } = result.transactions[index];
    assert.match(id, /^[0-9a-f-]{36}$/);
    assert.equal(Number.isNaN(Date.parse(createdAt)), false);
    assert.deepEqual(input, preview.rows[index].input);
  }
  assert.deepEqual((await store.load()).transactions, result.transactions);
});

test("retries and newly formatted equivalent exports return the original identities without rewriting", async t => {
  const { store, path } = await fixture(t);
  const rows = [row("one", { note: "" }), row("two", { amountMinor: "150", note: " spaces " })];
  const source = csv(rows, [...HEADERS, "note"]);
  const args = await approved(store, source);
  const original = await commitTransactionImport(store, args);
  const bytes = await readFile(path);
  for (const repeat of [args, await approved(store, csv([...rows].reverse(), ["note", ...[...HEADERS].reverse()]) + "\r\n")]) {
    const outcome = await commitTransactionImport(store, repeat);
    assert.equal(outcome.added, 0);
    assert.equal(outcome.alreadyRecorded, 2);
    assert.deepEqual(outcome.totals, []);
    assert.deepEqual(new Map(outcome.transactions.map(tx => [tx.idempotencyKey, tx])), new Map(original.transactions.map(tx => [tx.idempotencyKey, tx])));
    assert.deepEqual(await readFile(path), bytes);
  }
  assert.equal(store.saves, 1);
});

test("preview reports key conflicts with original records and never changes the existing file", async t => {
  const { store, path } = await fixture(t);
  const original = await commitTransactionImport(store, await approved(store, csv([row("same")])));
  const before = await readFile(path);
  const result = await previewTransactionImport(store, { csv: csv([row("new"), row("same", { amountMinor: "999" })]) });
  assert.equal(result.canCommit, false);
  assert.equal(result.reviewToken, null);
  assert.deepEqual(result.counts, { total: 2, add: 1, alreadyRecorded: 0, conflict: 1 });
  assert.deepEqual(result.rows[1].existingTransaction, original.transactions[0]);
  assert.equal(result.rows[1].input.amountMinor, 999);
  assert.match(result.rows[1].reason!, /idempotencyKey/);
  assert.deepEqual(await readFile(path), before);
});

test("a conflict introduced after preview refuses every row inside the current serialized update", async t => {
  const { store, path } = await fixture(t);
  const args = await approved(store, csv([row("early-add"), row("late-conflict") ]));
  const another = new LedgerStore(path);
  await another.update(data => recordTransaction(data, { ...parseTransactionCsv(csv([row("late-conflict")])).rows[0].input, amountMinor: 7 }));
  const bytes = await readFile(path);
  await assert.rejects(commitTransactionImport(store, args), /no rows were saved/);
  assert.equal(store.saves, 0);
  assert.deepEqual(await readFile(path), bytes);
  assert.equal((await store.load()).transactions.length, 1);
});

test("all input identity fields including absent versus empty note participate in conflict admission", async t => {
  const { store } = await fixture(t);
  await commitTransactionImport(store, await approved(store, csv([row("identity")])));
  const changes: Record<string, string>[] = [{ type: "income" }, { currency: "EUR" }, { date: "2026-10-02" }, { category: "other" }, { amountMinor: "1" }];
  for (const change of changes) {
    assert.equal((await previewTransactionImport(store, { csv: csv([row("identity", change)]) })).counts.conflict, 1);
  }
  assert.equal((await previewTransactionImport(store, { csv: csv([row("identity", { note: "" })], [...HEADERS, "note"]) })).counts.conflict, 1);
});

test("the review token binds exact CSV bytes and rejects changed content before entering the writer", async t => {
  const { store } = await fixture(t);
  const source = csv([row("review", { note: "first" })], [...HEADERS, "note"]);
  const args = await approved(store, source);
  for (const changed of [source + "\n", source.replace("first", "second"), "\uFEFF" + source, source.replace("1234", "01234")]) {
    await assert.rejects(commitTransactionImport(store, { ...args, csv: changed }), /reviewToken/);
  }
  for (const reviewToken of [undefined, null, "bad", args.reviewToken.toUpperCase(), 123]) {
    await assert.rejects(commitTransactionImport(store, { csv: source, reviewToken }), /reviewToken/);
  }
  assert.equal(store.updates, 0);
  assert.equal(store.saves, 0);
});

test("manual tool admission rejects extra or nonobject arguments without depending on advertised schema", async t => {
  const { store } = await fixture(t);
  for (const args of [null, [], "csv", {}, { csv: 123 }, { csv: csv([row()]), dryRun: true }, { csv: csv([row()]), reviewToken: "x" }]) {
    await assert.rejects(previewTransactionImport(store, args), ValidationError);
  }
  await assert.rejects(commitTransactionImport(store, { ...await approved(store, csv([row()])), overwrite: true }), /unsupported/);
  assert.equal(store.saves, 0);
});

test("overlapping concurrent imports through two Store instances serialize and share original records", async t => {
  const { store, path } = await fixture(t);
  const second = new LedgerStore(path);
  const firstArgs = await approved(store, csv([row("a"), row("shared")]));
  const secondArgs = await approved(second, csv([row("shared"), row("b")]));
  const outcomes = await Promise.all([commitTransactionImport(store, firstArgs), commitTransactionImport(second, secondArgs)]);
  assert.equal(outcomes.reduce((sum, value) => sum + value.added, 0), 3);
  assert.equal(outcomes.reduce((sum, value) => sum + value.alreadyRecorded, 0), 1);
  assert.deepEqual(outcomes[0].transactions.find(tx => tx.idempotencyKey === "shared"), outcomes[1].transactions.find(tx => tx.idempotencyKey === "shared"));
  assert.equal((await store.load()).transactions.length, 3);
  assert.equal(new Set((await store.load()).transactions.map(tx => tx.id)).size, 3);
});

test("an exact ordinary recording after preview is a benign retry and unrelated later state survives", async t => {
  const { store } = await fixture(t);
  const args = await approved(store, csv([row("shared"), row("new")]));
  const existing = await store.update(data => {
    setBudget(data, "food", "2026-10", 5000, "USD");
    recordTransaction(data, parseTransactionCsv(csv([row("unrelated")])).rows[0].input);
    return recordTransaction(data, parseTransactionCsv(csv([row("shared")])).rows[0].input);
  });
  const before = await store.load();
  const result = await commitTransactionImport(store, args);
  const after = await store.load();
  assert.equal(result.added, 1);
  assert.equal(result.alreadyRecorded, 1);
  assert.deepEqual(result.transactions[0], existing);
  assert.deepEqual(after.budgets, before.budgets);
  assert.equal(after.version, before.version);
  assert.deepEqual(after.transactions.slice(0, before.transactions.length), before.transactions);
});

test("imports preserve both legacy and denominated budget schemas", async t => {
  const { store } = await fixture(t);
  for (const currency of [undefined, "EUR"]) {
    const data = emptyLedger();
    setBudget(data, "food", "2026-10", 5000, currency);
    await store.save(data);
    const before = await store.load();
    await commitTransactionImport(store, await approved(store, csv([row(`version-${before.version}`)])));
    const after = await store.load();
    assert.equal(after.version, before.version);
    assert.deepEqual(after.budgets, before.budgets);
  }
});

test("per-currency totals remain exact and reject unsafe gross totals before storage mutation", async t => {
  const { store } = await fixture(t);
  const max = String(Number.MAX_SAFE_INTEGER);
  const result = await previewTransactionImport(store, { csv: csv([
    row("usd-in", { amountMinor: max, type: "income" }), row("usd-out", { amountMinor: max }),
    row("eur", { currency: "EUR", amountMinor: "1" }),
  ]) });
  assert.deepEqual(result.totals.allRows, [
    { currency: "EUR", incomeMinor: 0, expenseMinor: 1, netMinor: -1 },
    { currency: "USD", incomeMinor: Number.MAX_SAFE_INTEGER, expenseMinor: Number.MAX_SAFE_INTEGER, netMinor: 0 },
  ]);
  for (const type of ["income", "expense"]) {
    await assert.rejects(previewTransactionImport(store, { csv: csv([row("max", { amountMinor: max, type }), row("overflow", { amountMinor: "1", type })]) }), /safe integer/);
  }
  assert.equal(store.saves, 0);
});

test("a failed save leaves the existing file whole and the same batch can retry through the released queue", async t => {
  const { store, path } = await fixture(t);
  await commitTransactionImport(store, await approved(store, csv([row("existing")])));
  const before = await readFile(path);
  const args = await approved(store, csv([row("new-1"), row("new-2")]));
  store.failNext = true;
  await assert.rejects(commitTransactionImport(store, args), /injected persistence failure/);
  assert.deepEqual(await readFile(path), before);
  const result = await commitTransactionImport(store, args);
  assert.equal(result.added, 2);
  assert.equal((await store.load()).transactions.length, 3);
  const complete = await readFile(path);
  assert.equal((await commitTransactionImport(store, args)).added, 0);
  assert.deepEqual(await readFile(path), complete);
});

test("invalid existing ledger data is refused without replacing it", async t => {
  const { store, path } = await fixture(t);
  const args = await approved(store, csv([row()]));
  const bytes = '{"version":999,"transactions":[],"budgets":[]}\n';
  await writeFile(path, bytes);
  await assert.rejects(previewTransactionImport(store, { csv: args.csv }), ValidationError);
  await assert.rejects(commitTransactionImport(store, args), ValidationError);
  assert.equal(await readFile(path, "utf8"), bytes);
  assert.equal(store.saves, 0);
});
