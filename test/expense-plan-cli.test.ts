import assert from "node:assert/strict";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { captureInput, publishNewReport } from "../src/household-plan.js";
import { MAX_LEDGER_BYTES, MAX_PLAN_BYTES } from "../src/expense-plan.js";

const entry = fileURLToPath(new URL("../src/household-plan.js", import.meta.url));
const data = { version: 2, transactions: [
  { id: "existing", type: "expense", amountMinor: 4, currency: "USD", date: "2026-10-01", category: "food", createdAt: "2026-10-01T00:00:00Z" },
], budgets: [{ category: "food", month: "2026-10", currency: "USD", limitMinor: 10 }] };
const plan = { schema: "household-expense-plan/1", expenses: [
  { date: "2026-10-20", amountMinor: 3, category: "food", note: "\nexact\r\nnote Ω" },
  { date: "2026-10-20", amountMinor: 3, category: "food", note: "\nexact\r\nnote Ω" },
] };
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function setup() {
  const root = await fs.mkdtemp(join(tmpdir(), "household-plan-test-"));
  const ledger = join(root, "ledger.json"), input = join(root, "plan.json");
  await fs.writeFile(ledger, JSON.stringify(data) + "\n");
  await fs.writeFile(input, JSON.stringify(plan) + "\n");
  const output = join(root, "report.html");
  return { root, ledger, input, output };
}
function run(ledger: string, plan: string, output: string, extra: string[] = []) {
  return spawnSync(process.execPath, [entry, "--ledger", ledger, "--plan", plan,
    "--month", "2026-10", "--currency", "USD", "--out", output, ...extra],
  { encoding: "utf8", timeout: 10000 });
}
async function absent(path: string) { await assert.rejects(fs.lstat(path), { code: "ENOENT" }); }

test("real CLI creates complete static report and preserves both input identities", async () => {
  const f = await setup();
  try {
    const original = await Promise.all([f.ledger, f.input].map(async path => ({ bytes: await fs.readFile(path), stat: await fs.stat(path, { bigint: true }) })));
    const r = run(f.ledger, f.input, f.output);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stderr, "");
    const html = await fs.readFile(f.output, "utf8");
    const raw = html.match(/id="expense-plan-data">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(raw);
    const p = JSON.parse(raw);
    assert.equal(p.recorded.expenseMinor, 4);
    assert.equal(p.plannedExpenseMinor, 6);
    assert.equal(p.hypothetical.expenseMinor, 10);
    assert.equal(p.budgets[0].hypotheticalOver, false);
    assert.equal(p.expenses.length, 2);
    assert.equal(p.expenses[0].note, "\nexact\r\nnote Ω");
    for (const [i, path] of [f.ledger, f.input].entries()) {
      assert.deepEqual(await fs.readFile(path), original[i].bytes);
      const after = await fs.stat(path, { bigint: true });
      assert.equal(after.ino, original[i].stat.ino);
      assert.equal(after.mtimeNs, original[i].stat.mtimeNs);
    }
    assert.equal(p.provenance.ledger.sha256, hash(original[0].bytes));
    assert.equal(p.provenance.plan.sha256, hash(original[1].bytes));
    assert.deepEqual((await fs.readdir(f.root)).sort(), ["ledger.json", "plan.json", "report.html"]);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("real CLI refuses every existing destination without replacing its contents", async () => {
  const f = await setup();
  try {
    const existing = join(f.root, "existing.html");
    await fs.writeFile(existing, "other writer\n");
    const hard = join(f.root, "hard.html"), symbolic = join(f.root, "symbolic.html"), directory = join(f.root, "directory");
    await fs.link(f.ledger, hard); await fs.symlink(existing, symbolic); await fs.mkdir(directory);
    const original = await fs.readFile(f.ledger);
    for (const out of [existing, hard, symbolic, directory, f.ledger, f.input]) {
      const r = run(f.ledger, f.input, out);
      assert.notEqual(r.status, 0);
      assert.equal(r.stdout, "");
    }
    assert.equal(await fs.readFile(existing, "utf8"), "other writer\n");
    assert.deepEqual(await fs.readFile(f.ledger), original);
    assert.equal((await fs.lstat(symbolic)).isSymbolicLink(), true);
    assert.equal((await fs.readdir(f.root)).some(name => name.endsWith(".tmp")), false);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("real CLI invalid later expense, invalid UTF-8 and source/destination paths create no output", async () => {
  const f = await setup();
  try {
    await fs.writeFile(f.input, JSON.stringify({ ...plan, expenses: [...plan.expenses, { ...plan.expenses[0], amountMinor: 0 }] }));
    assert.equal(run(f.ledger, f.input, f.output).status, 2);
    await absent(f.output);
    await fs.writeFile(f.input, Buffer.from([0xc3, 0x28]));
    assert.equal(run(f.ledger, f.input, f.output).status, 2);
    await absent(f.output);
    await fs.writeFile(f.input, JSON.stringify(plan));
    for (const source of [join(f.root, "absent.json"), f.root]) {
      assert.equal(run(source, f.input, f.output).status, 2);
      await absent(f.output);
    }
    assert.notEqual(run(f.ledger, f.input, join(f.root, "missing", "report.html")).status, 0);
    assert.equal(run(f.ledger, f.input, f.output, ["--month", "2026-10"]).status, 2);
    await absent(f.output);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("changed bytes and same-byte replacement refuse after capture without delivery", async () => {
  for (const which of ["ledger", "plan", "replacement"] as const) {
    const f = await setup();
    try {
      const captured = [await captureInput(f.ledger, MAX_LEDGER_BYTES, "ledger"), await captureInput(f.input, MAX_PLAN_BYTES, "plan")];
      if (which === "replacement") {
        const replacement = join(f.root, "replacement.json");
        await fs.writeFile(replacement, captured[0].bytes);
        await fs.rename(replacement, f.ledger);
      } else {
        const path = which === "ledger" ? f.ledger : f.input;
        await fs.appendFile(path, " ");
      }
      const changed = await fs.readFile(which === "plan" ? f.input : f.ledger);
      await assert.rejects(publishNewReport(f.output, "<!doctype html><p>complete</p>", captured), /changed before delivery/);
      await absent(f.output);
      assert.deepEqual(await fs.readFile(which === "plan" ? f.input : f.ledger), changed);
      assert.equal((await fs.readdir(f.root)).some(name => name.endsWith(".tmp")), false);
    } finally { await fs.rm(f.root, { recursive: true, force: true }); }
  }
});

test("source disappearance refuses delivery and publication retains an existing writer", async () => {
  const f = await setup();
  try {
    const captured = [await captureInput(f.ledger, MAX_LEDGER_BYTES, "ledger"), await captureInput(f.input, MAX_PLAN_BYTES, "plan")];
    await fs.unlink(f.input);
    await assert.rejects(publishNewReport(f.output, "complete", captured), /cannot be confirmed/);
    await absent(f.output);
    await fs.writeFile(f.input, captured[1].bytes);
    const current = [await captureInput(f.ledger, MAX_LEDGER_BYTES, "ledger"), await captureInput(f.input, MAX_PLAN_BYTES, "plan")];
    await fs.writeFile(f.output, "winner", { flag: "wx" });
    await assert.rejects(publishNewReport(f.output, "complete", current), { code: "EEXIST" });
    assert.equal(await fs.readFile(f.output, "utf8"), "winner");
    assert.equal((await fs.readdir(f.root)).some(name => name.endsWith(".tmp")), false);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});

test("real CLI empty plan and standalone help remain explicit", async () => {
  const f = await setup();
  try {
    await fs.writeFile(f.input, JSON.stringify({ schema: "household-expense-plan/1", expenses: [] }));
    const r = run(f.ledger, f.input, f.output);
    assert.equal(r.status, 0, r.stderr);
    assert.match(await fs.readFile(f.output, "utf8"), /plan has no additions/);
    const help = spawnSync(process.execPath, [entry, "--help"], { encoding: "utf8", timeout: 5000 });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--ledger FILE --plan FILE/);
    assert.equal(spawnSync(process.execPath, [entry, "--help", "--out", f.output], { encoding: "utf8", timeout: 5000 }).status, 2);
  } finally { await fs.rm(f.root, { recursive: true, force: true }); }
});
