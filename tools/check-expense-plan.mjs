import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
if (!target || process.argv.length !== 3) {
  process.stderr.write("Usage: node tools/check-expense-plan.mjs NEW-RECEIVING-DIRECTORY\n");
  process.exitCode = 2;
} else {
  const root = resolve(target);
  await fs.mkdir(root, { mode: 0o700 });
  const entry = fileURLToPath(new URL("../dist/src/household-plan.js", import.meta.url));
  const ledger = join(root, "fictional-ledger.json"), plan = join(root, "fictional-plan.json"), output = join(root, "expense-preview.html");
  const stamp = "2026-10-08T00:00:00Z";
  const transaction = (id, type, amountMinor, category, currency = "USD") =>
    ({ id, type, amountMinor, category, currency, date: "2026-10-08", createdAt: stamp });
  const data = { version: 2, transactions: [
    transaction("fixture-income", "income", 500000, "salary"),
    transaction("fixture-food", "expense", 45000, "food"),
    transaction("fixture-travel", "expense", 20000, "travel"),
    transaction("fixture-eur", "expense", 900, "food", "EUR"),
  ], budgets: [
    { category: "food", month: "2026-10", limitMinor: 50000, currency: "USD" },
    { category: "travel", month: "2026-10", limitMinor: 30000, currency: "USD" },
    { category: "food", month: "2026-10", limitMinor: 1000, currency: "EUR" },
  ] };
  const input = { schema: "household-expense-plan/1", expenses: [
    { date: "2026-10-20", amountMinor: 3750, category: "food", note: "\nFictional groceries\r\nΩ" },
    { date: "2026-10-20", amountMinor: 3750, category: "food", note: "\nFictional groceries\r\nΩ" },
    { date: "2026-10-21", amountMinor: 12000, category: "travel" },
  ] };
  await fs.writeFile(ledger, JSON.stringify(data, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await fs.writeFile(plan, JSON.stringify(input, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  const before = await Promise.all([ledger, plan].map(async path => ({ bytes: await fs.readFile(path), stat: await fs.stat(path, { bigint: true }) })));
  const args = [entry, "--ledger", ledger, "--plan", plan, "--month", "2026-10", "--currency", "USD", "--out", output];
  const processResult = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 15000 });
  await fs.writeFile(join(root, "cli.stdout"), processResult.stdout ?? "", { flag: "wx" });
  await fs.writeFile(join(root, "cli.stderr"), processResult.stderr ?? "", { flag: "wx" });
  const receipt = { schema: "household-expense-plan-native-receiving/1", executable: process.execPath, node: process.version,
    args, exitCode: processResult.status, signal: processResult.signal, browserReceived: false, checks: [] };
  try {
    assert.equal(processResult.status, 0, processResult.stderr || String(processResult.error));
    const bytes = await fs.readFile(output), html = bytes.toString("utf8");
    const raw = html.match(/<script type="application\/json" id="expense-plan-data">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(raw);
    const p = JSON.parse(raw);
    assert.deepEqual([p.recorded.incomeMinor, p.recorded.expenseMinor, p.recorded.netMinor], [500000, 65000, 435000]);
    receipt.checks.push("recorded totals");
    assert.deepEqual([p.plannedExpenseMinor, p.hypothetical.expenseMinor, p.hypothetical.netMinor], [19500, 84500, 415500]);
    receipt.checks.push("planned and hypothetical totals");
    assert.deepEqual(p.budgets.map(row => [row.category, row.recordedRemainingMinor, row.hypotheticalRemainingMinor, row.hypotheticalOver]),
      [["food", 5000, -2500, true], ["travel", 10000, -2000, true]]);
    receipt.checks.push("unchanged allowance and budget crossings");
    assert.deepEqual(p.expenses.map(row => [row.position, row.amountMinor, row.note]),
      [[1, 3750, "\nFictional groceries\r\nΩ"], [2, 3750, "\nFictional groceries\r\nΩ"], [3, 12000, undefined]]);
    receipt.checks.push("occurrence and note fidelity");
    for (const [i, path] of [ledger, plan].entries()) {
      assert.deepEqual(await fs.readFile(path), before[i].bytes);
      const after = await fs.stat(path, { bigint: true });
      assert.equal(after.ino, before[i].stat.ino); assert.equal(after.mtimeNs, before[i].stat.mtimeNs);
      assert.equal((i === 0 ? p.provenance.ledger : p.provenance.plan).sha256, createHash("sha256").update(before[i].bytes).digest("hex"));
    }
    receipt.checks.push("source bytes identities write-times and hashes");
    assert.equal(p.currency, "USD");
    assert.equal(p.budgets.some(row => row.currency === "EUR"), false);
    receipt.checks.push("selected currency");
    assert.match(html, /not an account balance/);
    assert.match(html, /These planned expenses have not been recorded/);
    assert.match(html, /id="planned-expenses"/);
    receipt.checks.push("visible consumer explanation and report structure");
    const second = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 15000 });
    await fs.writeFile(join(root, "existing-destination.stdout"), second.stdout ?? "", { flag: "wx" });
    await fs.writeFile(join(root, "existing-destination.stderr"), second.stderr ?? "", { flag: "wx" });
    assert.notEqual(second.status, 0);
    assert.deepEqual(await fs.readFile(output), bytes);
    receipt.checks.push("new-only output refusal");
    receipt.output = { path: output, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
    receipt.ok = true;
  } catch (error) {
    receipt.ok = false; receipt.error = { message: String(error), stack: error.stack }; process.exitCode = 1;
  } finally {
    await fs.writeFile(join(root, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  }
  process.stdout.write(JSON.stringify({ root, ok: receipt.ok, checks: receipt.checks.length }) + "\n");
}
