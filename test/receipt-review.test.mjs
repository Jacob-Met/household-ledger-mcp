import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { LedgerStore, recordTransaction, ValidationError } from "../src/ledger.ts";
import { ReviewError, previewReceiptReview, commitReceiptReview } from "../tools/lib/receipt-review.mjs";

const root = process.env.RECEIPT_REVIEW_TEST_ROOT;
if (!root) throw new Error("Set RECEIPT_REVIEW_TEST_ROOT to an empty owned fixture directory");
await fs.mkdir(root, { recursive: false });
const NS = "householdReceiptReview";
const SCHEMA = "household.receipt-review/1";
const cli = fileURLToPath(new URL("../tools/household-receipt-review.mjs", import.meta.url));
const transaction = () => JSON.parse('{"id":"receipt-A","type":"expense","amountMinor":1299,"currency":"USD","date":"2026-10-01","category":"groceries","note":"Original note","idempotencyKey":"original-key","createdAt":"2026-10-01T12:00:00Z","legacy":{"__proto__":{"safe":true},"array":[null,true,7,"café"]}}');
const ledger = () => ({ version: 1, transactions: [transaction()], budgets: [{ category: "groceries", month: "2026-10", limitMinor: 20000, legacy: [1, "kept"] }], metadata: { retained: "literal" } });
const request = (changes = {}) => ({ id: "receipt-A", state: "reviewed", note: "Matched paper receipt", ...changes });
async function fixture(name, data = ledger()) {
  const file = path.join(root, name + ".json");
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
  return { file, store: new LedgerStore(file) };
}
async function stamp(file) {
  return { bytes: (await fs.readFile(file)).toString("base64"), ns: (await fs.stat(file, { bigint: true })).mtimeNs.toString() };
}
const tokens = (preview, input = request()) => ({ ...input, expectedDigest: preview.expectedDigest, recordDigest: preview.recordDigest });
async function refuse(store, file, fn) {
  const before = await stamp(file);
  await assert.rejects(fn, ReviewError);
  assert.deepEqual(await stamp(file), before);
}
let childOrdinal = 0;
async function rawChild(base, input = "") {
  const result = spawnSync(process.execPath, base, { input, encoding: "utf8", maxBuffer: 3 * 1024 * 1024, timeout: 10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(Number.isInteger(result.status), true);
  const n = ++childOrdinal;
  await fs.writeFile(path.join(root, "cli-" + n + "-stdout.txt"), result.stdout, { flag: "wx" });
  await fs.writeFile(path.join(root, "cli-" + n + "-stderr.txt"), result.stderr, { flag: "wx" });
  await fs.writeFile(path.join(root, "cli-" + n + "-closure.json"), JSON.stringify({ pid: result.pid, status: result.status, signal: result.signal, command: [process.execPath, ...base] }) + "\n", { flag: "wx" });
  return result;
}
async function child(file, input, args = []) {
  return rawChild(["--experimental-transform-types", cli, "--ledger", file, "--id", "receipt-A", "--state", "reviewed", ...args], input);
}

test("preview is detached, complete, literal, read-only and records canonical digests", async () => {
  const { file, store } = await fixture("preview");
  const before = await stamp(file);
  const p = await previewReceiptReview(store, request());
  assert.equal(p.priorReview, "absent");
  assert.match(p.expectedDigest, /^[0-9a-f]{64}$/);
  assert.equal(p.expectedDigest, p.recordDigest);
  assert.deepEqual(p.before, transaction());
  assert.deepEqual(p.proposed, { ...transaction(), [NS]: { schema: SCHEMA, state: "reviewed", note: "Matched paper receipt", recordDigest: p.recordDigest } });
  p.before.legacy.array.push("detached");
  p.proposed.amountMinor = 1;
  assert.deepEqual(await stamp(file), before);
  assert.deepEqual((await store.load()).transactions[0], transaction());
});

test("commit only adds namespace, preserves metadata/prototype keys and original retry", async () => {
  const original = ledger();
  const { file, store } = await fixture("preserve", original);
  const p = await previewReceiptReview(store, request());
  const result = await commitReceiptReview(store, tokens(p));
  assert.equal(result.status, "updated");
  const after = await store.load();
  const expected = ledger();
  expected.transactions[0][NS] = p.proposed[NS];
  assert.deepEqual(after, expected);
  assert.equal(Object.hasOwn(after.transactions[0].legacy, "__proto__"), true);
  const saved = await stamp(file);
  await store.update(d => {
    const got = recordTransaction(d, { type: "expense", amountMinor: 1299, currency: "USD", date: "2026-10-01", category: "groceries", note: "Original note", idempotencyKey: "original-key" });
    assert.equal(got, d.transactions[0]);
    assert.equal(d.transactions.length, 1);
  });
  assert.deepEqual(await stamp(file), saved);
  result.transaction.amountMinor = 2;
  assert.equal((await store.load()).transactions[0].amountMinor, 1299);
});

test("repeat confirmation is matching state without rewrite and valid review can change", async () => {
  const { file, store } = await fixture("replay");
  const p = await previewReceiptReview(store, request());
  await commitReceiptReview(store, tokens(p));
  const saved = await stamp(file);
  assert.equal((await commitReceiptReview(store, tokens(p))).status, "already_matching");
  assert.deepEqual(await stamp(file), saved);
  const q = await previewReceiptReview(store, request({ state: "unreviewed", note: "Check later" }));
  assert.equal(q.priorReview, "current");
  await commitReceiptReview(store, tokens(q, request({ state: "unreviewed", note: "Check later" })));
  assert.equal((await store.load()).transactions[0][NS].state, "unreviewed");
  await refuse(store, file, () => commitReceiptReview(store, tokens(p)));
});

test("two real Store instances serialize identical and conflicting proposals", async () => {
  const first = await fixture("queue-identical");
  const p = await previewReceiptReview(first.store, request());
  const other = new LedgerStore(first.file);
  const same = await Promise.all([commitReceiptReview(first.store, tokens(p)), commitReceiptReview(other, tokens(p))]);
  assert.deepEqual(same.map(v => v.status), ["updated", "already_matching"]);
  const conflict = await fixture("queue-conflict");
  const q = await previewReceiptReview(conflict.store, request());
  const statuses = await Promise.allSettled([
    commitReceiptReview(conflict.store, tokens(q)),
    commitReceiptReview(new LedgerStore(conflict.file), tokens(q, request({ note: "Conflicting review" }))),
  ]);
  assert.equal(statuses[0].status, "fulfilled");
  assert.equal(statuses[1].status, "rejected");
  assert.ok(statuses[1].reason instanceof ReviewError);
  assert.equal((await conflict.store.load()).transactions[0][NS].note, "Matched paper receipt");
});

test("unrelated queued changes survive while changed original metadata refuses", async () => {
  const { file, store } = await fixture("unrelated");
  const p = await previewReceiptReview(store, request());
  await new LedgerStore(file).update(d => { d.budgets[0].limitMinor = 23000; d.metadata.extra = "keep"; d.transactions.push({ ...transaction(), id: "other", idempotencyKey: "other-key" }); });
  await commitReceiptReview(store, tokens(p));
  const after = await store.load();
  assert.equal(after.budgets[0].limitMinor, 23000);
  assert.equal(after.metadata.extra, "keep");
  assert.equal(after.transactions.length, 2);
  const q = await previewReceiptReview(store, request());
  await store.update(d => { d.transactions[0].legacy.array.push("changed"); });
  await refuse(store, file, () => commitReceiptReview(store, tokens(q)));
  const fresh = await previewReceiptReview(store, request({ note: "Rechecked current original" }));
  assert.equal(fresh.priorReview, "stale");
  await commitReceiptReview(store, tokens(fresh, request({ note: "Rechecked current original" })));
  assert.equal((await previewReceiptReview(store, request())).priorReview, "current");
});

test("IDs are exact, duplicate/missing refuse and absent ledger remains absent", async () => {
  const data = ledger(); data.transactions[0].id = " Δ\\receipt ";
  const { file, store } = await fixture("literal-id", data);
  assert.equal((await previewReceiptReview(store, request({ id: " Δ\\receipt " }))).id, " Δ\\receipt ");
  await refuse(store, file, () => previewReceiptReview(store, request({ id: "Δ\\receipt" })));
  const duplicates = ledger(); duplicates.transactions.push({ ...transaction(), idempotencyKey: "second-key" });
  const duplicate = await fixture("duplicate", duplicates);
  await refuse(duplicate.store, duplicate.file, () => previewReceiptReview(duplicate.store, request()));
  const missing = path.join(root, "missing.json");
  await assert.rejects(previewReceiptReview(new LedgerStore(missing), request()), ReviewError);
  await assert.rejects(fs.stat(missing), e => e.code === "ENOENT");
});

test("whole-ledger late rows and budgets retain original validation errors", async () => {
  for (const [name, mutate] of [
    ["late-row", d => d.transactions.push({ ...transaction(), id: "bad", amountMinor: 0, idempotencyKey: "bad" })],
    ["late-budget", d => d.budgets.push({ category: "late", month: "2026-10", limitMinor: -1 })],
  ]) {
    const data = ledger(); mutate(data);
    const { file, store } = await fixture(name, data);
    const before = await stamp(file);
    await assert.rejects(previewReceiptReview(store, request()), ValidationError);
    assert.deepEqual(await stamp(file), before);
  }
});

test("foreign/malformed namespaces refuse instead of overwriting", async () => {
  for (const [i, value] of [null, true, [], { schema: "foreign", state: "reviewed", note: "", recordDigest: "a".repeat(64) }, { schema: SCHEMA, state: "reviewed", note: "", recordDigest: "a".repeat(64), extra: 1 }, { schema: SCHEMA, state: "reviewed", note: "", recordDigest: "A".repeat(64) }].entries()) {
    const data = ledger(); data.transactions[0][NS] = value;
    const { file, store } = await fixture("namespace-" + i, data);
    await refuse(store, file, () => previewReceiptReview(store, request()));
  }
});

test("strict arguments and direct Store instance refusal happen before ledger read", async () => {
  const invalid = path.join(root, "invalid-json.txt");
  await fs.writeFile(invalid, "not JSON", { flag: "wx" });
  const store = new LedgerStore(invalid);
  for (const value of [null, {}, { ...request(), extra: 1 }, request({ id: "" }), request({ id: "x".repeat(513) }), request({ state: "yes" }), request({ note: "x".repeat(2049) })]) {
    await assert.rejects(previewReceiptReview(store, value), ReviewError);
  }
  class OtherStore extends LedgerStore {}
  await assert.rejects(previewReceiptReview(new OtherStore(invalid), request()), ReviewError);
  const genuine = new LedgerStore(invalid);
  genuine.load = async () => ledger();
  await assert.rejects(previewReceiptReview(genuine, request()), ReviewError);
  await assert.rejects(commitReceiptReview(store, { ...request(), expectedDigest: "a".repeat(64), recordDigest: "BAD" }), ReviewError);
});

test("semantic JSON admission rejects negative zero, nonfinite, depth and node expansion", async () => {
  for (const [name, data] of [
    ["depth", (() => { const d = ledger(); let v = d.metadata; for (let i = 0; i < 33; i++) v = v.next = {}; return d; })()],
    ["nodes", (() => { const d = ledger(); d.metadata.values = Array(100000).fill(0); return d; })()],
  ]) {
    const f = await fixture(name, data);
    await refuse(f.store, f.file, () => previewReceiptReview(f.store, request()));
  }
  for (const [name, literal] of [["nonfinite", "1e400"], ["negative-zero", "-0"]]) {
    const f = await fixture(name);
    const bytes = await fs.readFile(f.file, "utf8");
    await fs.writeFile(f.file, bytes.replace('"metadata": {', '"metadata": {"number":' + literal + ','));
    await refuse(f.store, f.file, () => previewReceiptReview(f.store, request()));
  }
  const large = ledger(); large.metadata.large = "x".repeat(8 * 1024 * 1024);
  const f = await fixture("semantic-size", large);
  await refuse(f.store, f.file, () => previewReceiptReview(f.store, request()));
});

test("oversized preview result refuses before save; bounded result succeeds", async () => {
  const small = ledger(); small.transactions[0].payload = "x".repeat(200000);
  const a = await fixture("bounded-result", small);
  assert.ok(Buffer.byteLength(JSON.stringify(await previewReceiptReview(a.store, request()))) <= 1024 * 1024);
  const large = ledger(); large.transactions[0].payload = "x".repeat(600000);
  const b = await fixture("oversized-result", large);
  await refuse(b.store, b.file, () => previewReceiptReview(b.store, request()));
});

test("native CLI confirms exactly once with complete preview and success", async () => {
  const f = await fixture("cli-confirm");
  const result = await child(f.file, "CONFIRM\r\n", ["--note", "literal Δ café"]);
  assert.equal(result.status, 0);
  const lines = result.stdout.trimEnd().split("\n").map(JSON.parse);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].before.note, "Original note");
  assert.equal(lines[1].status, "updated");
  assert.equal(lines[1].transaction[NS].note, "literal Δ café");
  assert.deepEqual((await f.store.load()).transactions[0], lines[1].transaction);
});

test("native CLI cancel, EOF and unterminated confirmation never mutate", async () => {
  for (const [name, input] of [["cancel", "CANCEL\n"], ["eof", ""], ["unterminated", "CONFIRM"], ["wrong", "CONFIRM \n"], ["overlong", "CONFIRMXX\n"]]) {
    const f = await fixture("cli-" + name);
    const before = await stamp(f.file);
    const result = await child(f.file, input);
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trimEnd().split("\n").length, 1);
    assert.deepEqual(await stamp(f.file), before);
  }
});

test("native CLI strict failure and help preserve unread invalid input", async () => {
  const invalid = path.join(root, "cli-invalid.json");
  await fs.writeFile(invalid, "not JSON", { flag: "wx" });
  const before = await stamp(invalid);
  const result = await child(invalid, "CONFIRM\n", ["--id", "duplicate flag"]);
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.deepEqual(await stamp(invalid), before);
  const help = await rawChild(["--experimental-transform-types", cli, "--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage:/);
});

test("preview snapshots mutable fields and reads each declared argument once", async () => {
  const f = await fixture("preview-input-drift");
  const before = await stamp(f.file);
  const input = request();
  const pending = previewReceiptReview(f.store, input);
  input.id = "changed-after-call"; input.state = "INVALID"; input.note = "x".repeat(2049);
  const result = await pending;
  assert.equal(result.id, "receipt-A");
  assert.equal(result.proposed[NS].state, "reviewed");
  assert.equal(result.proposed[NS].note, "Matched paper receipt");
  assert.deepEqual(await stamp(f.file), before);
  assert.equal(input.state, "INVALID");
  assert.equal(input.note.length, 2049);
  const values = request();
  const counts = Object.fromEntries(Object.keys(values).map(key => [key, 0]));
  const getterInput = Object.fromEntries(Object.keys(values).map(key => [key, undefined]));
  for (const key of Object.keys(values)) Object.defineProperty(getterInput, key, { enumerable: true, get() { counts[key]++; return values[key]; } });
  const getterResult = await previewReceiptReview(f.store, getterInput);
  assert.equal(getterResult.proposed[NS].note, values.note);
  assert.deepEqual(counts, { id: 1, state: 1, note: 1 });
});

test("queued commit uses its private validated snapshot including both tokens", async () => {
  const f = await fixture("commit-input-drift");
  const p = await previewReceiptReview(f.store, request());
  let release, entered;
  const barrier = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const blocker = new LedgerStore(f.file).update(async () => { entered(); await barrier; });
  await ready;
  const input = tokens(p);
  const pending = commitReceiptReview(f.store, input);
  input.id = "changed-after-call"; input.state = "INVALID"; input.note = "x".repeat(2049);
  input.expectedDigest = "not-a-digest"; input.recordDigest = "not-a-digest";
  release(); await blocker;
  const result = await pending;
  assert.equal(result.status, "updated");
  assert.equal(result.transaction.id, "receipt-A");
  assert.equal(result.transaction[NS].state, "reviewed");
  assert.equal(result.transaction[NS].note, "Matched paper receipt");
  assert.equal(input.expectedDigest, "not-a-digest");
  const values = tokens(p);
  const counts = Object.fromEntries(Object.keys(values).map(key => [key, 0]));
  const getterInput = Object.fromEntries(Object.keys(values).map(key => [key, undefined]));
  for (const key of Object.keys(values)) Object.defineProperty(getterInput, key, { enumerable: true, get() { counts[key]++; return values[key]; } });
  const saved = await stamp(f.file);
  assert.equal((await commitReceiptReview(f.store, getterInput)).status, "already_matching");
  assert.deepEqual(counts, { id: 1, state: 1, note: 1, expectedDigest: 1, recordDigest: 1 });
  assert.deepEqual(await stamp(f.file), saved);
});
