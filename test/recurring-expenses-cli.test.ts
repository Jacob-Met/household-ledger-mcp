import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, openSync, closeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { emptyLedger, recordTransaction, setBudget } from "../src/ledger.js";

const producer = fileURLToPath(new URL("../src/household-recurring-plan.js", import.meta.url));
const consumer = fileURLToPath(new URL("../src/household-plan.js", import.meta.url));
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const rules = () => ({
  schema: "household-recurring-expenses/1", currency: " usd ", rules: [{
    id: "food", start: "2026-10-05", category: " Food ", amountMinor: 100,
    repeat: { unit: "week", every: 1 }, note: "\r\n\u0000\ud800</script>",
  }],
});
function run(args: string[], stdio?: ["ignore", number | "pipe", number | "pipe"]) {
  const result = spawnSync(process.execPath, ["--max-old-space-size=64", producer, ...args], {
    encoding: "utf8", timeout: 10000, maxBuffer: 2 * 1024 * 1024,
    ...(stdio === undefined ? {} : { stdio }),
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "household-recurring-test-"));
  const source = join(dir, "rules source.json"), output = join(dir, "plan.json");
  const raw = Buffer.from("\ufeff" + JSON.stringify(rules(), null, 2).replace(/\n/g, "\r\n") + "\r\n", "utf8");
  writeFileSync(source, raw);
  return { dir, source, output, raw, args: ["--rules", source, "--month", "2026-10", "--out", output] };
}
test("real CLI publishes exact plan and provenance, consumed by unchanged original route", () => {
  const f = fixture();
  try {
    const result = run(f.args);
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(result.stdout);
    const bytes = readFileSync(f.output), plan = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.toString("utf8"), JSON.stringify(plan, null, 2) + "\n");
    assert.equal(receipt.currency, "USD");
    assert.equal(receipt.schema, "household-recurring-expense-plan-delivery/1");
    assert.deepEqual(receipt.source, { path: resolve(f.source), bytes: f.raw.length, sha256: hash(f.raw) });
    assert.deepEqual(receipt.output, { path: resolve(f.output), bytes: bytes.length, sha256: hash(bytes) });
    assert.deepEqual(receipt.occurrences.map((x: { date: string }) => x.date), ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"]);
    assert.equal(plan.expenses[0].note, rules().rules[0].note);
    assert.deepEqual(Object.keys(plan).sort(), ["expenses", "schema"]);
    const ledger = emptyLedger();
    recordTransaction(ledger, { type: "expense", amountMinor: 100, currency: "USD", date: "2026-10-01", category: "Food" });
    setBudget(ledger, "Food", "2026-10", 400, "USD");
    const ledgerPath = join(f.dir, "ledger.json"), htmlPath = join(f.dir, "preview.html");
    const ledgerBytes = Buffer.from(JSON.stringify(ledger) + "\n");
    writeFileSync(ledgerPath, ledgerBytes);
    const native = spawnSync(process.execPath, ["--max-old-space-size=64", consumer,
      "--ledger", ledgerPath, "--plan", f.output, "--month", receipt.month,
      "--currency", receipt.currency, "--out", htmlPath], { encoding: "utf8", timeout: 10000 });
    assert.ifError(native.error); assert.equal(native.status, 0, native.stderr);
    const inspection = readFileSync(htmlPath, "utf8").match(/<script type="application\/json" id="expense-plan-data">([\s\S]*?)<\/script>/);
    assert.ok(inspection);
    const preview = JSON.parse(inspection[1]);
    assert.equal(preview.expenses.length, 4);
    assert.equal(preview.hypothetical.expenseMinor, 500);
    assert.equal(preview.budgets[0].hypotheticalOver, true);
    assert.equal(preview.provenance.plan.sha256, hash(bytes));
    assert.deepEqual(readFileSync(ledgerPath), ledgerBytes);
    assert.deepEqual(readFileSync(f.source), f.raw);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
test("existing output and source-output alias refuse without replacing bytes", () => {
  const f = fixture();
  try {
    writeFileSync(f.output, "existing\n");
    assert.equal(run(f.args).status, 1);
    assert.equal(readFileSync(f.output, "utf8"), "existing\n");
    assert.equal(run(["--rules", f.source, "--month", "2026-10", "--out", f.source]).status, 1);
    assert.deepEqual(readFileSync(f.source), f.raw);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
test("invalid inactive rule and malformed arguments refuse before any output", () => {
  const f = fixture();
  try {
    const invalid = rules();
    invalid.rules[0].start = "9999-01-01";
    invalid.rules[0].amountMinor = 0;
    writeFileSync(f.source, JSON.stringify(invalid));
    assert.equal(run(f.args).status, 2);
    assert.equal(existsSync(f.output), false);
    assert.equal(run([...f.args, "--month", "2026-10"]).status, 2);
    assert.equal(run(["--help", "--out", f.output]).status, 2);
    assert.equal(run(["--rules"]).status, 2);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
test("failed receipt delivery returns1 while preserving a complete published plan", () => {
  const f = fixture();
  const closedOutput = openSync(f.source, "r");
  try {
    const result = run(f.args, ["ignore", closedOutput, "pipe"]);
    assert.equal(result.status, 1);
    const bytes = readFileSync(f.output), plan = JSON.parse(bytes.toString("utf8"));
    assert.equal(plan.expenses.length, 4);
    assert.equal(bytes.toString("utf8"), JSON.stringify(plan, null, 2) + "\n");
    assert.match(result.stderr, /complete plan was published/);
    assert.deepEqual(readFileSync(f.source), f.raw);
  } finally { closeSync(closedOutput); rmSync(f.dir, { recursive: true, force: true }); }
});
test("failed diagnostic stream preserves refusal and failed help never claims success", () => {
  const f = fixture();
  const bad = openSync(f.source, "r");
  try {
    assert.equal(run(["--bogus", "x"], ["ignore", "pipe", bad]).status, 2);
    assert.equal(run(["--help"], ["ignore", bad, bad]).status, 1);
    assert.equal(existsSync(f.output), false);
    assert.equal(run(["--help"]).status, 0);
    assert.deepEqual(readFileSync(f.source), f.raw);
  } finally { closeSync(bad); rmSync(f.dir, { recursive: true, force: true }); }
});
