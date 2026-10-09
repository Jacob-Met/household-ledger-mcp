import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, lstat, symlink, link, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { parsePrintArguments, printLedgerFile } from "../src/household-print.js";
const cli = fileURLToPath(new URL("../src/household-print.js", import.meta.url));
const data = Buffer.from(JSON.stringify({ version: 2, budgets: [], transactions: [{ id: "duplicate", type: "expense", amountMinor: 123, currency: "EUR", date: "2026-10-01", category: " food ", note: "actual CLI" }] }));
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), "household-print-test-")); t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, "input # %.json"); await writeFile(input, data); return { root, input, output: join(root, "review # %.html") };
}
const opts = (ledger: string, out: string) => ({ ledger, out, from: "2026-10-01", to: "2026-10-31" });
const run = (input: string, output: string, more: string[] = []) => spawnSync(process.execPath, [cli, "--ledger", input, "--from", "2026-10-01", "--to", "2026-10-31", "--out", output, ...more], { encoding: "utf8" });
test("actual command publishes complete HTML with exact receipt and input metadata unchanged", async t => {
  const { root, input, output } = await setup(t); const before = await lstat(input, { bigint: true });
  const result = run(input, output, ["--category", " food "]); assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout), html = await readFile(output);
  assert.equal(receipt.matchedRows, 1); assert.deepEqual(receipt.sourcePositions, [1]);
  assert.equal(receipt.sourceSha256, createHash("sha256").update(data).digest("hex"));
  assert.equal(receipt.outputSha256, createHash("sha256").update(html).digest("hex")); assert.equal(receipt.outputBytes, html.length);
  assert.equal(receipt.outputPath, output); assert.match(html.toString(), /actual CLI/);
  const after = await lstat(input, { bigint: true }); for (const key of ["ino", "mtimeNs", "ctimeNs", "size"] as const) assert.equal(after[key], before[key]);
  assert.deepEqual(await readFile(input), data);
  assert.deepEqual((await readdir(root)).sort(), ["input # %.json", "review # %.html"]);
});
test("existing output bytes are never changed", async t => {
  const { input, output } = await setup(t); await writeFile(output, "preserve");
  const result = run(input, output); assert.equal(result.status, 2); assert.equal(result.stdout, ""); assert.equal(await readFile(output, "utf8"), "preserve");
});
test("source-path, hardlink and dangling-symlink outputs all refuse", async t => {
  const { root, input, output } = await setup(t);
  assert.equal(run(input, input).status, 2);
  await link(input, output); assert.equal(run(input, output).status, 2); assert.deepEqual(await readFile(input), data);
  const dangling = join(root, "dangling.html"); await symlink(join(root, "absent"), dangling);
  assert.equal(run(input, dangling).status, 2); assert.equal((await lstat(dangling)).isSymbolicLink(), true);
});
test("input symlink and nonregular input refuse; output is absent", async t => {
  const { root, input, output } = await setup(t); const alias = join(root, "alias.json"); await symlink(input, alias);
  assert.equal(run(alias, output).status, 2); assert.equal(run(root, output).status, 2);
  await assert.rejects(lstat(output), { code: "ENOENT" });
});
test("invalid source/selector and unavailable parent leave no output or temporary document", async t => {
  const { root, input, output } = await setup(t); await writeFile(input, "{bad");
  const result = run(input, output); assert.equal(result.status, 2); assert.equal(result.stdout, "");
  await assert.rejects(lstat(output), { code: "ENOENT" });
  await writeFile(input, data); assert.equal(run(input, output, ["--type", "unknown"]).status, 2);
  assert.equal(run(input, join(root, "absent", "review.html")).status, 2);
  assert.deepEqual(await readdir(root), ["input # %.json"]);
});
test("two concurrent writers publish exactly one complete document without overwrite", async t => {
  const { root, input, output } = await setup(t);
  const results = await Promise.allSettled([printLedgerFile(opts(input, output)), printLedgerFile(opts(input, output))]);
  assert.equal(results.filter(x => x.status === "fulfilled").length, 1); assert.equal(results.filter(x => x.status === "rejected").length, 1);
  const receipt = results.find(x => x.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof printLedgerFile>>>;
  const html = await readFile(output); assert.equal(createHash("sha256").update(html).digest("hex"), receipt.value.outputSha256);
  assert.deepEqual((await readdir(root)).sort(), ["input # %.json", "review # %.html"]);
});
test("argument parser refuses duplicate/unknown/missing flags and retains exact category", () => {
  const valid = ["--ledger", "x", "--from", "2026-10-01", "--to", "2026-10-31", "--out", "y"];
  for (const args of [[], [...valid, "--out", "z"], [...valid, "--force"], [...valid, "--category"]]) assert.throws(() => parsePrintArguments(args));
  assert.equal(parsePrintArguments([...valid, "--category", " "]).category, " ");
});
test("help performs no ledger access and failure never prints a success receipt", () => {
  const result = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" }); assert.equal(result.status, 0); assert.match(result.stdout, /Usage:/);
  const bad = spawnSync(process.execPath, [cli, "--force"], { encoding: "utf8" }); assert.equal(bad.status, 2); assert.equal(bad.stdout, "");
});
