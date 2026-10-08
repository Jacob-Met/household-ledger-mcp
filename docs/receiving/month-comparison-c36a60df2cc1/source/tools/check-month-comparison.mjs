import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const subject = resolve(here, "..");
if (process.argv.length !== 3) throw new Error("Usage: node tools/check-month-comparison.mjs /existing/NEW-directory");
const output = resolve(process.argv[2]);
await mkdir(output);
const source = {
  "fixture": {
    "version": 2,
    "transactions": [
      {
        "id": "review-1",
        "type": "income",
        "amountMinor": 300000,
        "currency": "USD",
        "date": "2026-08-15",
        "category": "Income",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-2",
        "type": "income",
        "amountMinor": 1000,
        "currency": "USD",
        "date": "2026-08-15",
        "category": "Interest",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-3",
        "type": "expense",
        "amountMinor": 120000,
        "currency": "USD",
        "date": "2026-08-15",
        "category": "Rent",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-4",
        "type": "expense",
        "amountMinor": 20000,
        "currency": "USD",
        "date": "2026-08-15",
        "category": "Food",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-5",
        "type": "expense",
        "amountMinor": 5000,
        "currency": "USD",
        "date": "2026-08-15",
        "category": "Bus",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-6",
        "type": "expense",
        "amountMinor": 7,
        "currency": "USD",
        "date": "2026-08-15",
        "category": "__proto__",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-7",
        "type": "expense",
        "amountMinor": 110,
        "currency": "USD",
        "date": "2026-08-15",
        "category": " Meal ",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-8",
        "type": "income",
        "amountMinor": 320000,
        "currency": "USD",
        "date": "2026-09-15",
        "category": "Income",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-9",
        "type": "income",
        "amountMinor": 11,
        "currency": "USD",
        "date": "2026-09-15",
        "category": "constructor",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-10",
        "type": "expense",
        "amountMinor": 125000,
        "currency": "USD",
        "date": "2026-09-15",
        "category": "Rent",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-11",
        "type": "expense",
        "amountMinor": 15000,
        "currency": "USD",
        "date": "2026-09-15",
        "category": "Food",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-12",
        "type": "expense",
        "amountMinor": 1000,
        "currency": "USD",
        "date": "2026-09-15",
        "category": "Books",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-13",
        "type": "expense",
        "amountMinor": 13,
        "currency": "USD",
        "date": "2026-09-15",
        "category": "toString",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-14",
        "type": "expense",
        "amountMinor": 120,
        "currency": "USD",
        "date": "2026-09-15",
        "category": "Meal",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-15",
        "type": "expense",
        "amountMinor": 900,
        "currency": "EUR",
        "date": "2026-09-15",
        "category": "EUR-only",
        "createdAt": "2026-10-08T00:00:00.000Z"
      },
      {
        "id": "review-16",
        "type": "expense",
        "amountMinor": 456,
        "currency": "USD",
        "date": "2026-10-15",
        "category": "Later",
        "createdAt": "2026-10-08T00:00:00.000Z"
      }
    ],
    "budgets": [
      {
        "month": "2026-08",
        "category": "Rent",
        "limitMinor": 130000,
        "currency": "USD"
      },
      {
        "month": "2026-08",
        "category": "Food",
        "limitMinor": 25000,
        "currency": "USD"
      },
      {
        "month": "2026-08",
        "category": "Unused",
        "limitMinor": 0,
        "currency": "USD"
      },
      {
        "month": "2026-08",
        "category": "RemovedBudget",
        "limitMinor": 400,
        "currency": "USD"
      },
      {
        "month": "2026-09",
        "category": "Rent",
        "limitMinor": 126000,
        "currency": "USD"
      },
      {
        "month": "2026-09",
        "category": "Food",
        "limitMinor": 0,
        "currency": "USD"
      },
      {
        "month": "2026-09",
        "category": "Future",
        "limitMinor": 99,
        "currency": "USD"
      },
      {
        "month": "2026-09",
        "category": "__proto__",
        "limitMinor": 0,
        "currency": "USD"
      },
      {
        "month": "2026-08",
        "category": "Rent",
        "limitMinor": 999,
        "currency": "EUR"
      }
    ]
  },
  "options": {
    "firstMonth": "2026-08",
    "secondMonth": "2026-09",
    "currency": "USD"
  },
  "expected": {
    "first": {
      "incomeMinor": 301000,
      "expenseMinor": 145117,
      "netMinor": 155883
    },
    "second": {
      "incomeMinor": 320011,
      "expenseMinor": 141133,
      "netMinor": 178878
    },
    "delta": {
      "incomeMinor": "19011",
      "expenseMinor": "-3984",
      "netMinor": "22995"
    },
    "categories": [
      " Meal ",
      "Books",
      "Bus",
      "Food",
      "Future",
      "Income",
      "Interest",
      "Meal",
      "RemovedBudget",
      "Rent",
      "Unused",
      "__proto__",
      "constructor",
      "toString"
    ]
  }
};
const ledgerBytes = Buffer.from(JSON.stringify(source.fixture, null, 2) + "\n");
const ledgerPath = join(output, "fictional-ledger.json");
const htmlPath = join(output, "comparison.html");
await writeFile(ledgerPath, ledgerBytes, { flag: "wx" });
const before = await stat(ledgerPath, { bigint: true });
const checks = [];
const check = async (name, fn) => {
  try { await fn(); checks.push({ name, passed: true }); }
  catch (error) { checks.push({ name, passed: false, error: String(error) }); }
};
const producer = await import(pathToFileURL(join(subject, "dist/src/ledger.js")).href);
await check("unchanged_native_monthly_summary_control", () => {
  const data = producer.validateLedgerData(source.fixture);
  for (const [key, month] of [["first", 8], ["second", 9]]) {
    const actual = producer.monthlySummary(data, 2026, month, "USD");
    for (const name of ["incomeMinor", "expenseMinor", "netMinor"]) {
      assert.equal(actual[name], source.expected[key][name]);
    }
  }
});
const args = [
  join(subject, "dist/src/household-compare.js"),
  "--ledger", ledgerPath, "--first", source.options.firstMonth,
  "--second", source.options.secondMonth, "--currency", source.options.currency,
  "--out", htmlPath,
];
const cli = spawnSync(process.execPath, args, { cwd: subject, encoding: "utf8", timeout: 30000 });
await writeFile(join(output, "cli.stdout.log"), cli.stdout || "", { flag: "wx" });
await writeFile(join(output, "cli.stderr.log"), cli.stderr || "", { flag: "wx" });
let report = null;
await check("actual_comparison_cli_receives_exact_category_budget_pair", async () => {
  assert.equal(cli.status, 0, cli.stderr || String(cli.error || "CLI failed"));
  const html = await readFile(htmlPath, "utf8");
  const match = html.match(/<script id="household-month-comparison-data" type="application\/json">([\s\S]*?)<\/script>/);
  assert.ok(match, "retained comparison data is present");
  report = JSON.parse(match[1]);
  assert.equal(report.schema, "household-ledger-month-comparison/1");
  assert.equal(report.firstMonth, source.options.firstMonth);
  assert.equal(report.secondMonth, source.options.secondMonth);
  assert.equal(report.currency, "USD");
  assert.equal(report.direction, "second-minus-first");
  assert.deepEqual(report.totals.first, source.expected.first);
  assert.deepEqual(report.totals.second, source.expected.second);
  assert.deepEqual(report.totals.change, source.expected.delta);
  assert.deepEqual(report.categories.map(row => row.category), source.expected.categories);
  const food = report.categories.find(row => row.category === "Food");
  assert.equal(food.second.budget.limitMinor, 0);
  assert.equal(food.change.budgetLimitMinor, "-25000");
  assert.equal(food.change.budgetRemainingMinor, "-20000");
  const removed = report.categories.find(row => row.category === "RemovedBudget");
  assert.equal(removed.second.budget, null);
  assert.equal(removed.change.budgetLimitMinor, null);
  assert.equal(report.source.bytes, ledgerBytes.length);
  assert.equal(report.source.sha256, createHash("sha256").update(ledgerBytes).digest("hex"));
});
await check("saved_input_bytes_inode_mtime_and_ctime_preserved", async () => {
  const after = await stat(ledgerPath, { bigint: true });
  assert.deepEqual(await readFile(ledgerPath), ledgerBytes);
  for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
    assert.equal(after[key], before[key], key);
  }
});
const receipt = {
  subject, output, command: [process.execPath, ...args],
  node: process.version, cliStatus: cli.status,
  checks, passed: checks.filter(x => x.passed).length,
  failed: checks.filter(x => !x.passed).length,
  reportCreated: existsSync(htmlPath), report,
};
await writeFile(join(output, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ passed: receipt.passed, failed: receipt.failed, cliStatus: cli.status, receipt: join(output, "receipt.json") }));
process.exitCode = receipt.failed ? 1 : 0;
