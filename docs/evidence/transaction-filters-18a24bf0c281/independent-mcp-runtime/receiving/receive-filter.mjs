import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [variant, runName] = process.argv.slice(2);
if (!["original", "candidate"].includes(variant) || !/^[A-Za-z0-9_-]+$/.test(runName ?? "")) {
  throw new Error("Expected original|candidate and a fresh safe run label");
}
const source = join(ROOT, variant);
const runDir = join(ROOT, "evidence", runName);
const fixtureDir = join(runDir, "fixture");
const ledgerPath = join(fixtureDir, "ledger.json");
const trace = [];
let child;
let client;
let childOutput = "";
let childError = "";

const hash = data => createHash("sha256").update(data).digest("hex");
const equal = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch { return false; } };
async function bounded(promise, label, ms = 6000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label + " timed out")), ms);
  })]); } finally { clearTimeout(timer); }
}
async function identity(path) {
  const bytes = await readFile(path);
  return { path, bytes: bytes.length, sha256: hash(bytes) };
}
async function witness() {
  const bytes = await readFile(ledgerPath);
  const metadata = await stat(ledgerPath, { bigint: true });
  return {
    bytes: bytes.length, sha256: hash(bytes),
    file_identity: Object.fromEntries(["dev", "ino", "mode", "size", "mtimeNs", "ctimeNs"]
      .map(key => [key, String(metadata[key])])),
    directory_members: (await readdir(fixtureDir)).sort()
  };
}
async function stopOwnedServer() {
  if (client) { await bounded(client.close(), "client close").catch(() => undefined); client = undefined; }
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill("SIGTERM");
    await bounded(exited, "private server exit");
  }
}
async function startOwnedServer() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const executable = join(source, "dist/src/index.js");
  child = spawn(process.execPath, [executable], {
    cwd: source,
    env: { ...process.env, HOUSEHOLD_LEDGER_HOST: "127.0.0.1",
      HOUSEHOLD_LEDGER_PORT: String(port), HOUSEHOLD_LEDGER_DATA_PATH: ledgerPath },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", chunk => { childOutput += String(chunk); });
  child.stderr.on("data", chunk => { childError += String(chunk); });
  await bounded(new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", code => reject(new Error("private server exited " + code + ": " + childError)));
    child.stdout.on("data", () => {
      if (childOutput.includes("listening on")) resolve();
    });
  }), "private server startup");
  const url = new URL("http://127.0.0.1:" + port);
  const health = await bounded(fetch(new URL("/healthz", url)), "private health request");
  assert.equal(health.status, 200);
  const { Client } = await import(pathToFileURL(join(source,
    "node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js")).href);
  const { StreamableHTTPClientTransport } = await import(pathToFileURL(join(source,
    "node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js")).href);
  client = new Client({ name: "independent-household-filter-receiver", version: "1" }, { capabilities: {} });
  await bounded(client.connect(new StreamableHTTPClientTransport(new URL("/mcp", url))), "MCP initialize");
  return { pid: child.pid, host: "127.0.0.1", port, executable, data_path: ledgerPath,
    health_status: health.status, transport: "actual SDK StreamableHTTPClientTransport and actual native HTTP entry" };
}

const receipt = {
  kind: "independent actual MCP transaction-filter receiving",
  variant, run: runName, source_root: source, receiver_pid: process.pid,
  node_version: process.version, platform: process.platform, arch: process.arch,
  only_synthetic_private_ledger: true, recording_or_import_tools_called: false,
  cases: trace
};
try {
  await mkdir(runDir, { recursive: false });
  await mkdir(fixtureDir);
  const fixtureBytes = await readFile(join(ROOT, "receiving/fixture-ledger.json"));
  const fixture = JSON.parse(fixtureBytes.toString("utf8"));
  const specification = JSON.parse(await readFile(join(ROOT, "receiving/case-spec.json"), "utf8"));
  const originals = new Map(fixture.transactions.map(tx => [tx.id, tx]));
  await writeFile(ledgerPath, fixtureBytes, { flag: "wx", mode: 0o600 });
  receipt.fixture_sha256 = hash(fixtureBytes);
  receipt.fixture_transactions = fixture.transactions.length;
  receipt.fixture_budget_count = fixture.budgets.length;
  receipt.expected_counts_and_rows = "hand-enumerated in frozen case-spec.json";
  receipt.drivers = await Promise.all(["receiving/receive-filter.mjs", "receiving/fixture-ledger.json",
    "receiving/case-spec.json", "receiving/run_receiving.py"].map(path => identity(join(ROOT, path))));
  receipt.source_inputs = await Promise.all(["src/index.ts", "src/ledger.ts", "src/cashflow.ts",
    "src/transaction-csv.ts", "src/transaction-import.ts", "package.json", "package-lock.json",
    "tsconfig.json"].map(path => identity(join(source, path))));
  receipt.executed_js = await Promise.all(["index.js", "ledger.js", "cashflow.js", "transaction-csv.js",
    "transaction-import.js"].map(path => identity(join(source, "dist/src", path))));
  receipt.initial_ledger = await witness();
  receipt.server = await startOwnedServer();
  receipt.tool_catalogue = await bounded(client.listTools(), "MCP tools/list");
  for (const item of specification.cases) {
    const before = await witness();
    const entry = { name: item.name, arguments: item.args, expected_total: item.total,
      expected_labels: item.labels, before, checks: [] };
    let response, payload, callError;
    try {
      response = await bounded(client.callTool({ name: "list_transactions", arguments: item.args }),
        "MCP list_transactions " + item.name);
      if (response.isError !== true && response.content?.[0]?.type === "text") {
        payload = JSON.parse(response.content[0].text);
      }
    } catch (error) { callError = String(error?.stack ?? error); }
    entry.response = response ?? null;
    entry.call_error = callError ?? null;
    const after = await witness();
    entry.after = after;
    const check = (name, passed, observed = null) => entry.checks.push({ name, passed, observed });
    const valid = !callError && response?.isError !== true && Array.isArray(payload?.transactions)
      && typeof payload?.total === "number";
    check("actual_tool_returns_transaction_result", valid);
    check("total_counts_all_predicate_matches_before_pagination", valid && payload.total === item.total,
      payload?.total ?? null);
    const expectedRows = item.labels.map(label => originals.get(specification.label_to_id[label]));
    check("page_contains_exact_expected_original_records_in_order", valid && equal(payload.transactions, expectedRows),
      payload?.transactions?.map(tx => tx.id) ?? null);
    check("all_returned_rows_are_unchanged_original_objects", valid && payload.transactions.every(tx =>
      originals.has(tx.id) && equal(tx, originals.get(tx.id))));
    check("ledger_content_bytes_remain_unchanged", before.sha256 === after.sha256
      && after.sha256 === receipt.initial_ledger.sha256);
    check("ledger_inode_and_write_timestamps_remain_unchanged",
      equal(before.file_identity, after.file_identity) && equal(after.file_identity, receipt.initial_ledger.file_identity));
    check("ledger_directory_gains_no_files", equal(before.directory_members, after.directory_members)
      && equal(after.directory_members, ["ledger.json"]));
    entry.passed = entry.checks.every(c => c.passed);
    trace.push(entry);
    console.log(JSON.stringify({ name: item.name, passed: entry.passed,
      failed_checks: entry.checks.filter(c => !c.passed).map(c => c.name),
      observed_total: payload?.total ?? null,
      observed_ids: payload?.transactions?.map(tx => tx.id) ?? null }));
  }
  await stopOwnedServer();
  receipt.final_ledger = await witness();
  receipt.source_inputs_after = await Promise.all(receipt.source_inputs.map(item => identity(item.path)));
  receipt.source_unchanged = equal(receipt.source_inputs, receipt.source_inputs_after);
  receipt.complete_read_phase_preserved_file = equal(receipt.initial_ledger, receipt.final_ledger);
  receipt.source_changes_by_reviewer = false;
  receipt.checks_passed = trace.reduce((n, row) => n + row.checks.filter(c => c.passed).length, 0);
  receipt.checks_total = trace.reduce((n, row) => n + row.checks.length, 0);
  receipt.all_cases_passed = trace.length === specification.cases.length
    && trace.every(row => row.passed) && receipt.source_unchanged && receipt.complete_read_phase_preserved_file;
} catch (error) {
  receipt.harness_error = String(error?.stack ?? error);
  receipt.all_cases_passed = false;
} finally {
  await stopOwnedServer().catch(error => { receipt.stop_error = String(error); });
  receipt.server_stdout = childOutput;
  receipt.server_stderr = childError;
  await writeFile(join(runDir, "server.stdout.log"), childOutput);
  await writeFile(join(runDir, "server.stderr.log"), childError);
  await writeFile(join(runDir, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
}
console.log(JSON.stringify({ variant, run: runName, cases: trace.length,
  cases_passed: trace.filter(x => x.passed).length,
  checks_passed: receipt.checks_passed, checks_total: receipt.checks_total,
  harness_error: receipt.harness_error ?? null,
  source_unchanged: receipt.source_unchanged,
  complete_read_phase_preserved_file: receipt.complete_read_phase_preserved_file,
  all_cases_passed: receipt.all_cases_passed }));
process.exitCode = receipt.all_cases_passed ? 0 : receipt.harness_error ? 2 : 1;
