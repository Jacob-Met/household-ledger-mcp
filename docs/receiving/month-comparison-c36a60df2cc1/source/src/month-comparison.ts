import { createHash } from "node:crypto";
import { monthlySummary, validateLedgerData, validateMonth } from "./ledger.js";
import type { MonthlySummary } from "./ledger.js";

export const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;
export const MAX_COMPARISON_CATEGORIES = 5000;
export const MAX_REPORT_BYTES = 16 * 1024 * 1024;

export class MonthComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthComparisonError";
  }
}

export interface ComparisonOptions {
  firstMonth: string;
  secondMonth: string;
  currency: string;
  sourceLabel?: string;
}

export interface MoneyTotals {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

export interface MoneyChanges {
  incomeMinor: string;
  expenseMinor: string;
  netMinor: string;
}

export type ComparisonBudget = MonthlySummary["budgets"][number];

export interface CategorySide extends MoneyTotals {
  budget: ComparisonBudget | null;
}

export interface CategoryComparison {
  category: string;
  first: CategorySide;
  second: CategorySide;
  change: MoneyChanges & {
    budgetLimitMinor: string | null;
    budgetSpentMinor: string | null;
    budgetRemainingMinor: string | null;
  };
}

export interface MonthComparison {
  schema: "household-ledger-month-comparison/1";
  generatedAt: string;
  source: { label: string; bytes: number; sha256: string };
  firstMonth: string;
  secondMonth: string;
  currency: string;
  direction: "second-minus-first";
  totals: { first: MoneyTotals; second: MoneyTotals; change: MoneyChanges };
  categories: CategoryComparison[];
}

function requireText(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string") throw new MonthComparisonError(field + " must be a string");
}

function requireRenderableText(value: string, field: string): void {
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code === 0 || (code >= 0xd800 && code <= 0xdfff)) {
      throw new MonthComparisonError(field + " contains a NUL or unpaired surrogate and cannot be rendered losslessly");
    }
  }
}

function monthParts(value: unknown, field: string): [number, number] {
  requireText(value, field);
  validateMonth(value);
  const [year, month] = value.split("-").map(Number);
  if (year < 1970 || year > 9999) {
    throw new MonthComparisonError(field + " must be in the native summary range 1970-01 through 9999-12");
  }
  return [year, month];
}

/** Convert each admitted operand before subtraction, including wide net changes. */
function difference(first: number, second: number): string {
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(second)) {
    throw new MonthComparisonError("a comparison operand is outside the exact integer range");
  }
  return (BigInt(second) - BigInt(first)).toString();
}

function totals(summary: MoneyTotals): MoneyTotals {
  return {
    incomeMinor: summary.incomeMinor,
    expenseMinor: summary.expenseMinor,
    netMinor: summary.netMinor,
  };
}

function changes(first: MoneyTotals, second: MoneyTotals): MoneyChanges {
  return {
    incomeMinor: difference(first.incomeMinor, second.incomeMinor),
    expenseMinor: difference(first.expenseMinor, second.expenseMinor),
    netMinor: difference(first.netMinor, second.netMinor),
  };
}

function budgetIndex(summary: MonthlySummary, month: string): Map<string, ComparisonBudget> {
  const result = new Map<string, ComparisonBudget>();
  for (const budget of summary.budgets) {
    if (result.has(budget.category)) {
      throw new MonthComparisonError(
        "cannot pair budgets: " + month + " has multiple native budget rows for one exact category"
      );
    }
    result.set(budget.category, { ...budget });
  }
  return result;
}

function categorySide(
  summary: MonthlySummary, budgets: Map<string, ComparisonBudget>, category: string
): CategorySide {
  const recorded = Object.hasOwn(summary.byCategory, category)
    ? summary.byCategory[category]
    : { incomeMinor: 0, expenseMinor: 0 };
  return {
    incomeMinor: recorded.incomeMinor,
    expenseMinor: recorded.expenseMinor,
    netMinor: recorded.incomeMinor - recorded.expenseMinor,
    budget: budgets.get(category) ?? null,
  };
}

/**
 * Admit the complete supplied byte view, then consume the unchanged native
 * summaries twice. No Store, filesystem, provider, or source mutation is used.
 */
export function compareLedgerSnapshot(bytes: Uint8Array, options: ComparisonOptions): MonthComparison {
  if (!(bytes instanceof Uint8Array)) throw new MonthComparisonError("snapshot must be a UTF-8 byte view");
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_SNAPSHOT_BYTES) {
    throw new MonthComparisonError("snapshot must contain 1 through " + MAX_SNAPSHOT_BYTES + " bytes");
  }
  const firstParts = monthParts(options.firstMonth, "first month");
  const secondParts = monthParts(options.secondMonth, "second month");
  if (options.firstMonth === options.secondMonth) {
    throw new MonthComparisonError("select two distinct months");
  }
  requireText(options.currency, "currency");
  const currency = options.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new MonthComparisonError("currency must be an explicit three-letter code");
  const sourceLabel = options.sourceLabel ?? "Selected ledger snapshot";
  requireText(sourceLabel, "source label");
  requireRenderableText(sourceLabel, "source label");

  let text: string;
  try {
    // TextDecoder respects byteOffset/byteLength; a single UTF-8 BOM is accepted
    // while the exact original bytes, including that BOM, remain in the digest.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new MonthComparisonError("snapshot is not valid UTF-8");
  }
  let raw: unknown;
  try { raw = JSON.parse(text); }
  catch { throw new MonthComparisonError("snapshot is not a complete JSON document"); }

  const data = validateLedgerData(raw);
  // Do not prefilter: native legacy-budget and full-ledger validation retain
  // their actual context, including currencies that are not selected.
  const firstSummary = monthlySummary(data, firstParts[0], firstParts[1], currency);
  const secondSummary = monthlySummary(data, secondParts[0], secondParts[1], currency);
  const firstBudgets = budgetIndex(firstSummary, options.firstMonth);
  const secondBudgets = budgetIndex(secondSummary, options.secondMonth);
  const categoryNames = new Set([
    ...Object.keys(firstSummary.byCategory), ...Object.keys(secondSummary.byCategory),
    ...firstBudgets.keys(), ...secondBudgets.keys(),
  ]);
  if (categoryNames.size > MAX_COMPARISON_CATEGORIES) {
    throw new MonthComparisonError("comparison exceeds " + MAX_COMPARISON_CATEGORIES + " complete categories");
  }
  // Native raw category identity is preserved; no trimming, folding, or locale
  // collation can merge distinct stored categories.
  const categories = [...categoryNames].sort().map(category => {
    requireRenderableText(category, "selected category");
    const first = categorySide(firstSummary, firstBudgets, category);
    const second = categorySide(secondSummary, secondBudgets, category);
    const paired = first.budget !== null && second.budget !== null;
    return {
      category, first, second,
      change: {
        ...changes(first, second),
        budgetLimitMinor: paired ? difference(first.budget!.limitMinor, second.budget!.limitMinor) : null,
        budgetSpentMinor: paired ? difference(first.budget!.spentMinor, second.budget!.spentMinor) : null,
        budgetRemainingMinor: paired ? difference(first.budget!.remainingMinor, second.budget!.remainingMinor) : null,
      },
    };
  });
  const firstTotals = totals(firstSummary);
  const secondTotals = totals(secondSummary);
  return {
    schema: "household-ledger-month-comparison/1",
    generatedAt: new Date().toISOString(),
    source: {
      label: sourceLabel, bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    firstMonth: options.firstMonth, secondMonth: options.secondMonth, currency,
    direction: "second-minus-first",
    totals: { first: firstTotals, second: secondTotals, change: changes(firstTotals, secondTotals) },
    categories,
  };
}

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"'\r]/g, character => {
    if (character === "&") return "&amp;";
    if (character === "<") return "&lt;";
    if (character === ">") return "&gt;";
    if (character === '"') return "&quot;";
    if (character === "'") return "&#39;";
    return "&#13;";
  });
}

function signed(value: string | null): string {
  if (value === null) return "Not comparable";
  return escapeHtml(value === "0" || value.startsWith("-") ? value : "+" + value);
}

function budgetBlock(budget: ComparisonBudget | null, currency: string): string {
  if (budget === null) return '<p class="absent">Absent</p>';
  const denomination = budget.currency === undefined
    ? "Legacy budget: stored currency absent; native " + currency + " month context"
    : "Stored currency: " + budget.currency;
  return "<dl><dt>Limit</dt><dd>" + escapeHtml(budget.limitMinor) +
    "</dd><dt>Spent</dt><dd>" + escapeHtml(budget.spentMinor) +
    "</dd><dt>Remaining</dt><dd>" + escapeHtml(budget.remainingMinor) +
    "</dd></dl><p>" + (budget.over ? "Over limit" : "Within limit") +
    "</p><p class=\"note\">" + escapeHtml(denomination) + "</p>";
}

/** One bounded, self-contained, script-free review of the exact comparison. */
export function renderMonthComparison(report: MonthComparison): string {
  const moneyKeys = ["incomeMinor", "expenseMinor", "netMinor"] as const;
  const labels = { incomeMinor: "Income", expenseMinor: "Expense", netMinor: "Net cash flow" };
  const e = escapeHtml;
  const summaryRows = moneyKeys.map(key =>
    "<tr><th scope=\"row\">" + labels[key] + "</th><td>" + e(report.totals.first[key]) +
    "</td><td>" + e(report.totals.second[key]) + "</td><td>" + signed(report.totals.change[key]) + "</td></tr>"
  ).join("\n");
  const categoryHeaders = moneyKeys.map(key =>
    '<th scope="col">' + labels[key] + "<br>First</th>" +
    '<th scope="col">' + labels[key] + "<br>Second</th>" +
    '<th scope="col">' + labels[key] + "<br>Change</th>"
  ).join("");
  const categoryRows = report.categories.map(row =>
    '<tr><th scope="row"><span class="category">' + e(row.category) + "</span></th>" +
    moneyKeys.map(key =>
      "<td>" + e(row.first[key]) + "</td><td>" + e(row.second[key]) +
      "</td><td>" + signed(row.change[key]) + "</td>"
    ).join("") + "</tr>"
  ).join("\n");
  const withBudgets = report.categories.filter(row => row.first.budget !== null || row.second.budget !== null);
  const budgetRows = withBudgets.map(row =>
    '<tr><th scope="row"><span class="category">' + e(row.category) + "</span></th><td>" +
    budgetBlock(row.first.budget, report.currency) + "</td><td>" +
    budgetBlock(row.second.budget, report.currency) + "</td><td>" +
    signed(row.change.budgetLimitMinor) + "</td><td>" +
    signed(row.change.budgetSpentMinor) + "</td><td>" +
    signed(row.change.budgetRemainingMinor) + "</td></tr>"
  ).join("\n");
  const retained = JSON.stringify(report).replace(/[<>&\u2028\u2029]/g, character =>
    "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
  );
  const html = [
    "<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">",
    "<title>Household month comparison</title>",
    "<style>",
    "*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#182430;font:16px/1.5 system-ui,sans-serif}",
    "main{max-width:1180px;margin:auto;padding:28px 20px}h1{font-size:2rem;line-height:1.15;margin:0 0 16px}h2{margin-top:32px}",
    ".context{background:#fff;border:1px solid #b5c5d4;border-left:5px solid #17635f;padding:16px;border-radius:8px}",
    ".context p{margin:6px 0}.note{font-size:.875rem;color:#384b5a}.source{overflow-wrap:anywhere}.category{white-space:pre-wrap;overflow-wrap:anywhere}",
    ".scroll{overflow-x:auto;background:#fff;border:1px solid #b5c5d4;border-radius:6px}.scroll:focus{outline:3px solid #17635f;outline-offset:3px}",
    "table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}caption{text-align:left;padding:12px;font-weight:600}",
    "th,td{padding:10px 12px;border-bottom:1px solid #dce3e9;text-align:right;vertical-align:top}thead th{background:#e8eef4;font-size:.875rem}",
    "th:first-child{text-align:left}tbody th{font-weight:600;min-width:120px}td{white-space:nowrap}",
    ".category-table{min-width:1020px}.budget-table{min-width:900px}.budget-table td{white-space:normal;min-width:125px}",
    "dl{margin:0;display:grid;grid-template-columns:1fr auto;gap:2px 10px;text-align:left}dt,dd{margin:0}dd{text-align:right;font-variant-numeric:tabular-nums}",
    ".budget-table p{margin:7px 0 0}.absent{font-style:italic}.empty{padding:16px;background:#fff;border:1px solid #b5c5d4}",
    "footer{margin-top:28px;border-top:1px solid #b5c5d4;padding-top:12px;font-size:.875rem}",
    "@media(max-width:480px){main{padding:20px 12px}h1{font-size:1.7rem}.context{padding:12px}}",
    "@media print{body{background:white;color:black;font-size:9pt}main{max-width:none;padding:0}.scroll{overflow:visible;border:0}table,.category-table,.budget-table{min-width:0;font-size:8pt}th,td{padding:5px;white-space:normal;overflow-wrap:anywhere}.budget-table td{min-width:0}h2{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}.note{color:black}.source{font-size:8pt}}",
    "</style>", "</head>", "<body>", "<main>",
    "<h1>Compare household months</h1>",
    '<section class="context" aria-label="Comparison selection">',
    "<p><strong>First month:</strong> " + e(report.firstMonth) + " &nbsp; <strong>Second month:</strong> " + e(report.secondMonth) + "</p>",
    "<p><strong>Currency:</strong> " + e(report.currency) + " &nbsp; <strong>Units:</strong> exact integer minor units</p>",
    "<p><strong>Change = second minus first.</strong> Your selected month order is retained. A positive change means the second value is larger.</p>",
    "<p class=\"note\">Net cash flow is recorded income minus recorded expense; it is not an account balance. Budget remaining is the native limit minus recorded expense.</p>",
    "<p class=\"source\"><strong>Source:</strong> " + e(report.source.label) + " · " + e(report.source.bytes) + " bytes<br><strong>SHA-256:</strong> " + e(report.source.sha256) + "</p>",
    "<p class=\"note\">Generated " + e(report.generatedAt) + " from one saved snapshot. Later ledger changes are not included.</p>",
    "</section>",
    "<h2>Monthly totals</h2>",
    '<div class="scroll" role="region" tabindex="0" aria-label="Monthly totals; scroll horizontally if needed">',
    "<table><caption>" + e(report.currency) + " · integer minor units</caption><thead><tr><th scope=\"col\">Recorded amount</th><th scope=\"col\">First: " +
      e(report.firstMonth) + "</th><th scope=\"col\">Second: " + e(report.secondMonth) + "</th><th scope=\"col\">Change</th></tr></thead><tbody>",
    summaryRows, "</tbody></table></div>",
    "<h2>Category changes</h2>",
    "<p>Every category recorded in either selected month or its budgets appears below. Category names keep their original spaces. Zero activity means no amount was recorded for that category in that selection.</p>",
    report.categories.length
      ? '<div class="scroll" role="region" tabindex="0" aria-label="Category changes; scroll horizontally to review all amounts"><table class="category-table"><caption>' +
        e(report.categories.length) + " categories · first " + e(report.firstMonth) + ", second " + e(report.secondMonth) + " · " + e(report.currency) +
        '</caption><thead><tr><th scope="col">Category</th>' + categoryHeaders + "</tr></thead><tbody>" + categoryRows + "</tbody></table></div>"
      : '<p class="empty">No selected transactions or qualified budgets in either month. Both monthly totals are zero.</p>',
    "<h2>Budget comparison</h2>",
    "<p>Absent means no native budget row exists for that category in the selected month and currency context. A present zero limit remains zero. Budget changes require a budget on both sides; otherwise they are marked Not comparable.</p>",
    withBudgets.length
      ? '<div class="scroll" role="region" tabindex="0" aria-label="Budget comparison; scroll horizontally to review all budget changes"><table class="budget-table"><caption>Native budget values · ' +
        e(report.currency) + ' integer minor units</caption><thead><tr><th scope="col">Category</th><th scope="col">First: ' + e(report.firstMonth) +
        '</th><th scope="col">Second: ' + e(report.secondMonth) + '</th><th scope="col">Limit change</th><th scope="col">Spent change</th><th scope="col">Remaining change</th></tr></thead><tbody>' +
        budgetRows + "</tbody></table></div>"
      : '<p class="empty">No qualified budget rows in either selected month.</p>',
    "<footer>This document contains selected category totals and budget information from the named snapshot. It can be opened or printed offline.</footer>",
    '<script id="household-month-comparison-data" type="application/json">' + retained + "</script>",
    "</main>", "</body>", "</html>", "",
  ].join("\n");
  if (Buffer.byteLength(html, "utf8") > MAX_REPORT_BYTES) {
    throw new MonthComparisonError("complete HTML report exceeds " + MAX_REPORT_BYTES + " bytes");
  }
  return html;
}
