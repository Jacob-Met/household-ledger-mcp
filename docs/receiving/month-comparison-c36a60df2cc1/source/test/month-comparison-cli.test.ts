import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, stat, rm, open, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseComparisonArguments, runComparisonCli } from "../src/household-compare.js";
import type { LedgerData } from "../src/ledger.js";
import type { FileHandle } from "node:fs/promises";

const entry = fileURLToPath(new URL("../src/household-compare.js", import.meta.url));
function fictionalLedger(): LedgerData {
  return {
    version: 2,
    transactions: [
      { id: "first", type: "expense", amountMinor: 20, currency: "USD", date: "2026-08-10", category: "Food", createdAt: "2026-10-08T00:00:00Z" },
      { id: "second", type: "expense", amountMinor: 7, currency: "USD", date: "2026-09-10", category: "Food", createdAt: "2026-10-08T00:00:00Z" },
    ],
    budgets: [
      { category: "Food", month: "2026-08", limitMinor: 25, currency: "USD" },
      { category: "Food", month: "2026-09", limitMinor: 0, currency: "USD" },
    ],
  };
}
function command(input: string, output: string) {
  const result = spawnSync(process.execPath, [
    entry, "--ledger", input, "--first", "2026-08", "--second", "2026-09",
    "--currency", "USD", "--out", output,
  ], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.error, undefined, "CLI infrastructure must complete rather than masquerade as a refusal");
  assert.equal(result.signal, null, "CLI was not terminated");
  return result;
}

test("actual CLI creates a private complete HTML file and preserves source bytes and metadata", async t => {
  const directory = await mkdtemp(join(tmpdir(), "household-comparison-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "review & notes.json");
  const output = join(directory, "report.html");
  const bytes = Buffer.from(JSON.stringify(fictionalLedger(), null, 2) + "\n");
  await writeFile(input, bytes);
  const before = await stat(input, { bigint: true });
  const result = command(input, output);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Created comparison:/);
  const html = await readFile(output, "utf8");
  const match = html.match(/<script id="household-month-comparison-data" type="application\/json">([\s\S]*?)<\/script>/)!;
  const report = JSON.parse(match[1]);
  assert.equal(report.totals.change.expenseMinor, "-13");
  assert.equal(report.categories[0].change.budgetRemainingMinor, "-12");
  assert.match(html, /review &amp; notes.json/);
  assert.deepEqual(await readFile(input), bytes);
  const after = await stat(input, { bigint: true });
  for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"] as const) assert.equal(after[key], before[key], key);
  if (process.platform !== "win32") assert.equal((await stat(output)).mode & 0o777, 0o600);
});

test("existing output and same-as-source paths refuse without replacing either file", async t => {
  const directory = await mkdtemp(join(tmpdir(), "household-comparison-collision-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "ledger.json");
  const output = join(directory, "already.html");
  const bytes = Buffer.from(JSON.stringify(fictionalLedger()));
  await writeFile(input, bytes);
  await writeFile(output, "ORIGINAL OUTPUT");
  const existing = command(input, output);
  assert.equal(existing.status, 1);
  assert.equal(existing.stdout, "");
  assert.equal(await readFile(output, "utf8"), "ORIGINAL OUTPUT");
  const same = command(input, input);
  assert.equal(same.status, 2);
  assert.equal(same.stdout, "");
  assert.deepEqual(await readFile(input), bytes);
});

test("missing, malformed and nonregular inputs create no output", async t => {
  const directory = await mkdtemp(join(tmpdir(), "household-comparison-inputs-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const malformed = join(directory, "bad.json");
  await writeFile(malformed, '{"version":2,"transactions":[');
  for (const [name, input] of [["missing", join(directory, "missing.json")], ["malformed", malformed], ["directory", directory]]) {
    const output = join(directory, name + ".html");
    const result = command(input, output);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(output), false);
  }
});

test("whole-snapshot and duplicate legacy-budget refusals precede output creation", async t => {
  const directory = await mkdtemp(join(tmpdir(), "household-comparison-admission-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const invalid = fictionalLedger();
  invalid.transactions.push({
    id: "invalid-other-month", type: "expense", amountMinor: -1, currency: "EUR",
    date: "2026-10-01", category: "Outside", createdAt: "2026-10-08T00:00:00Z",
  });
  const ambiguous = fictionalLedger();
  ambiguous.version = 1;
  ambiguous.budgets = [
    { category: "Food", month: "2026-08", limitMinor: 20 },
    { category: "Food", month: "2026-08", limitMinor: 30 },
  ];
  for (const [name, data] of [["invalid", invalid], ["ambiguous", ambiguous]] as const) {
    const input = join(directory, name + ".json");
    const output = join(directory, name + ".html");
    const bytes = Buffer.from(JSON.stringify(data));
    await writeFile(input, bytes);
    const result = command(input, output);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.equal(existsSync(output), false);
    assert.deepEqual(await readFile(input), bytes);
  }
});

test("a missing output parent is not created and no success is emitted", async t => {
  const directory = await mkdtemp(join(tmpdir(), "household-comparison-output-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "ledger.json");
  const parent = join(directory, "absent-parent");
  await writeFile(input, JSON.stringify(fictionalLedger()));
  const result = command(input, join(parent, "report.html"));
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(existsSync(parent), false);
});

test("FIFO input is refused without waiting for a writer", { skip: process.platform === "win32" }, async t => {
  const directory = await mkdtemp(join(tmpdir(), "household-comparison-fifo-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "pipe");
  const created = spawnSync("mkfifo", [input], { encoding: "utf8", timeout: 10000 });
  assert.equal(created.status, 0, created.stderr);
  const output = join(directory, "report.html");
  const result = command(input, output);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /regular file/);
  assert.equal(existsSync(output), false);
});

test("CLI requires all explicit arguments and rejects duplicate or unsupported options", () => {
  const valid = ["--ledger", "input.json", "--first", "2026-08", "--second", "2026-09", "--currency", "USD", "--out", "new.html"];
  assert.equal(parseComparisonArguments(["--help"]), null);
  assert.throws(() => parseComparisonArguments([]), /missing required/);
  assert.throws(() => parseComparisonArguments([...valid, "--first", "2026-07"]), /duplicate/);
  assert.throws(() => parseComparisonArguments([...valid, "--unknown", "x"]), /unknown/);
  assert.throws(() => parseComparisonArguments(["--ledger"]), /missing value/);
  assert.equal(parseComparisonArguments(valid)!.secondMonth, "2026-09");
});

test("interrupted actual report write never publishes a partial destination and removes its owned stage", async t => {
  const directory = await mkdtemp(join(tmpdir(), "household-comparison-interrupted-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "ledger.json");
  const output = join(directory, "report.html");
  await writeFile(input, JSON.stringify(fictionalLedger()));
  const probePath = join(directory, "prototype-probe");
  const probe = await open(probePath, "wx");
  const prototype = Object.getPrototypeOf(probe) as { writeFile: FileHandle["writeFile"] };
  const originalWrite = prototype.writeFile;
  await probe.close();
  await rm(probePath);
  let interrupted = false;
  prototype.writeFile = async function(this: FileHandle, ...args: Parameters<FileHandle["writeFile"]>): Promise<void> {
    if (interrupted) return originalWrite.call(this, ...args);
    interrupted = true;
    await originalWrite.call(this, Buffer.from("ACTUAL PARTIAL WRITE"));
    throw Object.assign(new Error("authored interruption after an actual filesystem write"), { code: "EIO" });
  };
  let exitCode: number;
  try {
    exitCode = await runComparisonCli([
      "--ledger", input, "--first", "2026-08", "--second", "2026-09",
      "--currency", "USD", "--out", output,
    ]);
  } finally {
    prototype.writeFile = originalWrite;
  }
  const observation = {
    exitCode, interrupted,
    outputExists: existsSync(output),
    directoryEntries: (await readdir(directory)).sort(),
    outputHex: existsSync(output) ? (await readFile(output)).toString("hex") : null,
  };
  if (process.env.HOUSEHOLD_FAULT_RECEIPT) {
    await writeFile(process.env.HOUSEHOLD_FAULT_RECEIPT, JSON.stringify(observation, null, 2) + "\n", { flag: "wx" });
  }
  assert.equal(exitCode, 1);
  assert.equal(interrupted, true);
  assert.equal(observation.outputExists, false);
  assert.deepEqual(observation.directoryEntries, ["ledger.json"]);
});
