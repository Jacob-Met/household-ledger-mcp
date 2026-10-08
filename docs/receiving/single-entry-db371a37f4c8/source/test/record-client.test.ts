import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, symlink, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { prepareRecording, parseRecording, recordingPreview, saveRecordingRequest, loadRecordingRequest, admittedRecordingResponse, recordingEndpoint, literal } from "../src/record-client.js";

const endpoint = "http://127.0.0.1:31337/mcp";
const input = { type: "expense", amountMinor: 1250, currency: " usd ", date: "2026-10-08", category: " groceries ", note: '東京 "\\n" \u202eEND' };
const request = () => prepareRecording(endpoint, input, "one-entry-key");
test("preview retains original domain normalization and literal private fields", () => {
  const r = request();
  assert.deepEqual(r, { version: 1, endpoint, transaction: { type: "expense", amountMinor: 1250, currency: "USD", date: "2026-10-08", category: "groceries", note: input.note, idempotencyKey: "one-entry-key" } });
  const p = recordingPreview(r);
  assert.ok(p.includes("1250")); assert.ok(p.includes("one-entry-key")); assert.ok(p.includes("東京"));
  assert.ok(p.includes("\\u202e")); assert.ok(!p.includes("\u202e"));
  assert.deepEqual(input.currency, " usd ");
  assert.equal(JSON.parse(literal(input.note)), input.note);
});
test("domain refusal is preserved for amount, date, direction, currency, category and key", () => {
  for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1, "1250"])
    assert.throws(() => prepareRecording(endpoint, { ...input, amountMinor: value }));
  for (const patch of [{ date: "2026-02-30" }, { type: "transfer" }, { currency: "US" }, { category: " " }, { note: 1 }, { idempotencyKey: null }, { idempotencyKey: " key " }, { surprise: true }])
    assert.throws(() => prepareRecording(endpoint, { ...input, ...patch }));
  assert.equal(prepareRecording(endpoint, { ...input, amountMinor: Number.MAX_SAFE_INTEGER }).transaction.amountMinor, Number.MAX_SAFE_INTEGER);
});
test("explicit literal loopback endpoints only; no credential, redirect target or endpoint override", () => {
  assert.equal(recordingEndpoint("http://[::1]:3000/mcp"), "http://[::1]:3000/mcp");
  for (const s of ["https://127.0.0.1/mcp", "http://example.com/mcp", "http://localhost:3000/mcp", "http://127.0.0.1:3000/other", "http://u:p@127.0.0.1/mcp", endpoint + "?x=1", endpoint + "#f"])
    assert.throws(() => recordingEndpoint(s));
});
test("recovery admission never silently normalizes changed fields or generates a key", () => {
  const r = request();
  assert.deepEqual(parseRecording(JSON.parse(JSON.stringify(r))), r);
  for (const change of [{ version: 2 }, { extra: true }, { endpoint: "http://127.0.0.1:80/mcp" }, { transaction: { ...r.transaction, currency: "usd" } }, { transaction: { ...r.transaction, category: " groceries " } }, { transaction: { ...r.transaction, idempotencyKey: undefined } }])
    assert.throws(() => parseRecording({ ...r, ...change }));
});
test("private new-only recovery file round trips; originals and linked destinations stay intact", async () => {
  const dir = await mkdtemp(join(tmpdir(), "single-record-file-"));
  try {
    const path = join(dir, "request.json");
    await saveRecordingRequest(path, request());
    const before = await readFile(path); const info = await stat(path);
    assert.equal(info.mode & 0o777, 0o600);
    assert.deepEqual(await loadRecordingRequest(path), request());
    await assert.rejects(saveRecordingRequest(path, request()));
    assert.deepEqual(await readFile(path), before);
    const link = join(dir, "link.json"); await symlink(path, link);
    await assert.rejects(saveRecordingRequest(link, request()));
    await assert.rejects(loadRecordingRequest(link));
    assert.deepEqual(await readFile(path), before);
    const directory = join(dir, "directory"); await mkdir(directory);
    await assert.rejects(loadRecordingRequest(directory));
    const fifo = join(dir, "fifo");
    if (process.platform !== "win32") {
      const made = spawnSync("mkfifo", [fifo]); assert.equal(made.status, 0);
      await assert.rejects(loadRecordingRequest(fifo));
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("invalid UTF-8, invalid JSON, oversized records and malformed requests refuse", async () => {
  const dir = await mkdtemp(join(tmpdir(), "single-record-bad-")); const p = join(dir, "input");
  try {
    for (const bytes of [Buffer.from([0xff]), Buffer.from("{"), Buffer.alloc(65537, 32), Buffer.from('{"version":1}')]) {
      await writeFile(p, bytes); await assert.rejects(loadRecordingRequest(p)); assert.deepEqual(await readFile(p), bytes);
    }
    assert.throws(() => prepareRecording(endpoint, { ...input, note: "x".repeat(65536) }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test("confirmation response must bind all exact fields and original recording identity", () => {
  const r = request(); const tx = { ...r.transaction, id: "native-id", createdAt: "2026-10-08T00:00:00.000Z" };
  const wrap = (t: unknown) => ({ content: [{ type: "text", text: JSON.stringify(t) }] });
  assert.deepEqual(admittedRecordingResponse(r, wrap(tx)), tx);
  for (const field of Object.keys(r.transaction)) assert.throws(() => admittedRecordingResponse(r, wrap({ ...tx, [field]: "changed" })));
  for (const bad of [{ isError: true, ...wrap(tx) }, { content: [] }, { content: [{ type: "text", text: "bad" }] }, wrap({ ...tx, id: "" }), wrap({ ...tx, createdAt: "" })])
    assert.throws(() => admittedRecordingResponse(r, bad));
  const noNote = prepareRecording(endpoint, { type: "income", amountMinor: 100, currency: "EUR", date: "2026-10-08", category: "work" }, "key");
  assert.throws(() => admittedRecordingResponse(noNote, wrap({ ...noNote.transaction, id: "id", createdAt: "now", note: "extra" })));
});
