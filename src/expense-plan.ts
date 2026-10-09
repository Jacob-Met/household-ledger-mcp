import { createHash } from "node:crypto";
import { monthlySummary, recordTransaction, validateLedgerData, validateMonth, ValidationError } from "./ledger.js";
import type { MonthlySummary } from "./ledger.js";

export const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
export const MAX_PLAN_BYTES = 1024 * 1024;
export const MAX_EXPENSES = 500;
export const MAX_CATEGORIES = 5000;
export const MAX_REPORT_BYTES = 16 * 1024 * 1024;

export interface PlannedExpense {
  position: number; date: string; category: string; amountMinor: number; currency: string; note?: string;
}
export interface CategoryComparison {
  category: string; recordedIncomeMinor: number; recordedExpenseMinor: number;
  plannedExpenseMinor: number; hypotheticalIncomeMinor: number; hypotheticalExpenseMinor: number; budgetCount: number;
}
export interface BudgetComparison {
  position: number; category: string; currency?: string; limitMinor: number;
  recordedSpentMinor: number; recordedRemainingMinor: number; recordedOver: boolean;
  hypotheticalSpentMinor: number; hypotheticalRemainingMinor: number; hypotheticalOver: boolean;
}
export interface ExpensePlanPreview {
  schema: "household-expense-plan-preview/1"; month: string; currency: string;
  expenses: PlannedExpense[]; plannedExpenseMinor: number; recorded: MonthlySummary; hypothetical: MonthlySummary;
  categories: CategoryComparison[]; budgets: BudgetComparison[];
}
export interface SnapshotIdentity { path: string; bytes: number; sha256: string }
export interface ReportIdentity { ledger: SnapshotIdentity; plan: SnapshotIdentity; generatedAt: string }

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
function objectWithKeys(value: unknown, keys: string[], required: string[], label: string): Record<string, unknown> {
  requireValue(typeof value === "object" && value !== null && !Array.isArray(value), `${label} must be an object`);
  const obj = value as Record<string, unknown>;
  requireValue(Object.keys(obj).every(key => keys.includes(key)), `${label} contains unsupported fields`);
  requireValue(required.every(key => Object.hasOwn(obj, key)), `${label} is missing required fields`);
  return obj;
}
function addMinor(a: number, b: number): number {
  const result = a + b;
  requireValue(Number.isSafeInteger(result), "planned expense total exceeds the safe integer range");
  return result;
}
function ordered(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

// Parse complete bounded UTF-8 JSON; source hashes retain original bytes, including a BOM.
export function parseSnapshot(bytes: Uint8Array, maximum: number, label: string): unknown {
  requireValue(bytes.byteLength > 0 && bytes.byteLength <= maximum, `${label} must contain 1..${maximum} bytes`);
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new ValidationError(`${label} must be complete UTF-8`); }
  try { return JSON.parse(text); }
  catch { throw new ValidationError(`${label} must contain complete JSON`); }
}
export function identifySnapshot(path: string, bytes: Uint8Array): SnapshotIdentity {
  return { path, bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") };
}

// The recorded summary qualifies before planned rows can affect currency context.
// Only detached native state is changed; no Store or persistent identity is returned.
export function previewExpensePlan(ledger: unknown, input: unknown, month: unknown, currency: unknown): ExpensePlanPreview {
  requireValue(typeof month === "string", "month is required");
  validateMonth(month);
  requireValue(typeof currency === "string", "currency is required");
  const [year, monthNumber] = month.split("-").map(Number);
  const recordedData = validateLedgerData(structuredClone(ledger));
  const recorded = monthlySummary(recordedData, year, monthNumber, currency);
  requireValue(recorded.currency !== null, "an explicit currency is required");
  const selectedCurrency = recorded.currency;
  const plan = objectWithKeys(input, ["schema", "expenses"], ["schema", "expenses"], "plan");
  requireValue(plan.schema === "household-expense-plan/1", "plan schema must be household-expense-plan/1");
  requireValue(Array.isArray(plan.expenses), "plan.expenses must be an array");
  requireValue(plan.expenses.length <= MAX_EXPENSES, `plan may contain at most ${MAX_EXPENSES} expenses`);
  const hypotheticalData = structuredClone(recordedData);
  const expenses: PlannedExpense[] = [];
  const plannedByCategory = new Map<string, number>();
  let plannedExpenseMinor = 0;
  for (const [index, raw] of plan.expenses.entries()) {
    const item = objectWithKeys(raw, ["date", "category", "amountMinor", "note"], ["date", "category", "amountMinor"], `expense ${index + 1}`);
    const native = recordTransaction(hypotheticalData, {
      type: "expense", amountMinor: item.amountMinor as number, currency: selectedCurrency,
      date: item.date as string, category: item.category as string,
      ...(Object.hasOwn(item, "note") ? { note: item.note as string } : {}),
    });
    requireValue(native.date.startsWith(`${month}-`), `expense ${index + 1} date must be inside ${month}`);
    const row: PlannedExpense = {
      position: index + 1, date: native.date, category: native.category,
      amountMinor: native.amountMinor, currency: native.currency,
    };
    if (native.note !== undefined) row.note = native.note;
    expenses.push(row);
    plannedExpenseMinor = addMinor(plannedExpenseMinor, row.amountMinor);
    plannedByCategory.set(row.category, addMinor(plannedByCategory.get(row.category) ?? 0, row.amountMinor));
  }
  const hypothetical = monthlySummary(hypotheticalData, year, monthNumber, selectedCurrency);
  const names = new Set([
    ...Object.keys(recorded.byCategory), ...Object.keys(hypothetical.byCategory),
    ...recorded.budgets.map(row => row.category),
  ]);
  requireValue(names.size <= MAX_CATEGORIES, `report may contain at most ${MAX_CATEGORIES} categories`);
  const categories = [...names].sort(ordered).map(category => ({
    category, recordedIncomeMinor: recorded.byCategory[category]?.incomeMinor ?? 0,
    recordedExpenseMinor: recorded.byCategory[category]?.expenseMinor ?? 0,
    plannedExpenseMinor: plannedByCategory.get(category) ?? 0,
    hypotheticalIncomeMinor: hypothetical.byCategory[category]?.incomeMinor ?? 0,
    hypotheticalExpenseMinor: hypothetical.byCategory[category]?.expenseMinor ?? 0,
    budgetCount: recorded.budgets.filter(row => row.category === category).length,
  }));
  // Preserve every native budget occurrence, including repeated legacy rows.
  const budgets = recorded.budgets.map((before, index): BudgetComparison => {
    const after = hypothetical.budgets[index];
    requireValue(after !== undefined && after.category === before.category &&
      after.limitMinor === before.limitMinor && after.currency === before.currency,
      "native budget correspondence changed");
    return {
      position: index + 1, category: before.category,
      ...(before.currency !== undefined ? { currency: before.currency } : {}),
      limitMinor: before.limitMinor,
      recordedSpentMinor: before.spentMinor, recordedRemainingMinor: before.remainingMinor, recordedOver: before.over,
      hypotheticalSpentMinor: after.spentMinor, hypotheticalRemainingMinor: after.remainingMinor, hypotheticalOver: after.over,
    };
  });
  requireValue(hypothetical.budgets.length === budgets.length, "native budget count changed");
  return { schema: "household-expense-plan-preview/1", month, currency: selectedCurrency,
    expenses, plannedExpenseMinor, recorded, hypothetical, categories, budgets };
}

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\r/g, "&#13;");
}
// A child span retains an initial LF; CR references survive HTML parser normalization.
function literal(value: string): string {
  const encoded = /\u0000|[\uD800-\uDFFF]/u.test(value);
  const shown = encoded ? JSON.stringify(value) : value;
  return `${encoded ? '<span class="notation">JSON string notation</span>' : ""}<pre class="literal"><span>${escape(shown)}</span></pre>`;
}
function status(over: boolean): string { return over ? "Over limit" : "Within limit"; }
function snapshot(label: string, source: SnapshotIdentity): string {
  return `<section class="source"><h3>${label}</h3>${literal(source.path)}<p>${source.bytes} captured bytes</p><p class="hash">SHA-256 ${escape(source.sha256)}</p></section>`;
}
export function renderExpensePlan(preview: ExpensePlanPreview, identity: ReportIdentity): string {
  const categoryRows = preview.categories.map((row, index) => `<tr data-category-position="${index + 1}"><th scope="row">${literal(row.category)}</th><td>${row.recordedIncomeMinor}</td><td>${row.recordedExpenseMinor}</td><td>${row.plannedExpenseMinor}</td><td>${row.hypotheticalExpenseMinor}</td><td>${row.budgetCount === 0 ? "No budget in snapshot" : `${row.budgetCount} budget row${row.budgetCount === 1 ? "" : "s"}`}</td></tr>`).join("");
  const budgetRows = preview.budgets.map(row => `<tr data-budget-position="${row.position}"><td>${row.position}</td><th scope="row">${literal(row.category)}</th><td>${row.currency === undefined ? "Legacy unassigned; qualified by recorded currency context" : escape(row.currency)}</td><td>${row.limitMinor}</td><td>${row.recordedSpentMinor}</td><td>${row.recordedRemainingMinor}</td><td>${status(row.recordedOver)}</td><td>${row.hypotheticalSpentMinor}</td><td>${row.hypotheticalRemainingMinor}</td><td>${status(row.hypotheticalOver)}</td></tr>`).join("");
  const expenseRows = preview.expenses.map(row => `<tr data-expense-position="${row.position}"><td>${row.position}</td><td>${escape(row.date)}</td><th scope="row">${literal(row.category)}</th><td>${row.amountMinor}</td><td>${row.note === undefined ? '<span class="absent">No note supplied</span>' : literal(row.note)}</td></tr>`).join("");
  const inspection = JSON.stringify({ ...preview, provenance: identity }).replace(/</g, "\\u003c");
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Expense plan preview — ${escape(preview.month)}</title>
<style>
:root{font-family:system-ui,sans-serif;color:#192d31;background:#f2f5f3;line-height:1.55}*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:auto;padding:clamp(18px,4vw,46px)}h1{font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15}h2{margin-top:2rem}h3{font-size:1rem}.eyebrow{text-transform:uppercase;letter-spacing:.1em;color:#47675b;font-weight:700}.intro{max-width:75ch}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin:24px 0}.card{background:white;border:1px solid #cbd8d0;border-radius:12px;padding:18px}.card strong{display:block;font-size:1.65rem}.muted,.absent{color:#536668}.callout{border-left:4px solid #517c62;padding:10px 16px;background:#e2ece5}.table-wrap{overflow:auto;border:1px solid #cbd8d0;border-radius:8px;background:white;margin:14px 0}table{border-collapse:collapse;width:100%;font-size:.92rem}th,td{padding:11px 13px;border-bottom:1px solid #dde5df;text-align:left;vertical-align:top}thead{background:#e7eee9}thead th{white-space:normal;min-width:90px}tbody th{font-weight:500;min-width:130px}.literal{font:inherit;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;min-width:0}.notation{display:block;font-size:.78rem;color:#5b485a;font-weight:700}.hash{font-family:monospace;overflow-wrap:anywhere}.sources{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}.source{min-width:0}.table-note{font-size:.9rem}footer{border-top:1px solid #bdcdc4;margin-top:2rem;padding-top:1rem;font-size:.9rem}
@media print{:root{background:white;color:black}main{max-width:none;padding:0}.card,.table-wrap{border-radius:0}.table-wrap{overflow:visible}table{font-size:8pt;table-layout:fixed}th,td{padding:5px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}h2,h3{break-after:avoid}.summary{grid-template-columns:repeat(3,1fr)}.source,.card{break-inside:avoid}}
</style></head><body><main>
<p class="eyebrow">Household · What-if preview</p><h1>Expense plan for ${escape(preview.month)}</h1>
<p class="intro">Compare the recorded snapshot with the same month after adding your declared expenses. <strong>These planned expenses have not been recorded.</strong> This report cannot record transactions or change budgets.</p>
<p>All amounts are exact integer <strong>${escape(preview.currency)} minor units</strong>. No currency conversion is performed.</p>
<div class="summary"><section class="card"><span>Declared additions</span><strong>${preview.plannedExpenseMinor}</strong><span>${preview.expenses.length} planned expense occurrence${preview.expenses.length === 1 ? "" : "s"}</span></section>
<section class="card"><span>Recorded expenses → with plan</span><strong>${preview.recorded.expenseMinor} → ${preview.hypothetical.expenseMinor}</strong></section>
<section class="card"><span>Monthly net → with plan</span><strong>${preview.recorded.netMinor} → ${preview.hypothetical.netMinor}</strong><span>Income minus expenses, not an account balance.</span></section></div>
<p class="callout">This is a calculation from the two captured inputs, not a prediction of future spending. Budget limits and recorded income (${preview.recorded.incomeMinor}) are unchanged.</p>
<h2>Category comparison</h2><p>Exact category spellings remain separate. A missing budget is different from a present zero limit.</p>
${categoryRows ? `<div class="table-wrap"><table id="category-comparison"><thead><tr><th>Category</th><th>Recorded income</th><th>Recorded expenses</th><th>Planned additions</th><th>Expenses with plan</th><th>Budget presence</th></tr></thead><tbody>${categoryRows}</tbody></table></div>` : "<p>No categories in this selected snapshot or plan.</p>"}
<h2>Budget comparison</h2><p class="table-note">Every native budget row is retained. “Over limit” means expenses are strictly greater than the limit; equality stays within it. Negative remaining amounts show the modeled overage.</p>
${budgetRows ? `<div class="table-wrap"><table id="budget-comparison"><thead><tr><th>Row</th><th>Category</th><th>Denomination</th><th>Limit</th><th>Recorded spent</th><th>Recorded remaining</th><th>Recorded status</th><th>Spent with plan</th><th>Remaining with plan</th><th>Status with plan</th></tr></thead><tbody>${budgetRows}</tbody></table></div>` : "<p>No applicable budget rows. No zero limit is inferred.</p>"}
<h2>Declared expense occurrences</h2><p>Repeated rows count separately. Categories use the native trimmed form; notes retain their literal text.</p>
${expenseRows ? `<div class="table-wrap"><table id="planned-expenses"><thead><tr><th>Occurrence</th><th>Date</th><th>Category</th><th>Amount</th><th>Note</th></tr></thead><tbody>${expenseRows}</tbody></table></div>` : "<p>The plan has no additions; the hypothetical results equal the recorded results.</p>"}
<h2>Captured inputs</h2><div class="sources">${snapshot("Recorded ledger", identity.ledger)}${snapshot("Expense plan", identity.plan)}</div>
<p>Generated ${escape(identity.generatedAt)}. Each input was captured separately; this is not a live or automatically refreshed view.</p>
<footer>Literal text is preserved. Values containing NUL or an unpaired surrogate are explicitly labeled JSON string notation so the entire original string remains reversible. The inspection record contains this comparison and the declared expenses, not the full ledger or prior transaction notes.</footer>
<script type="application/json" id="expense-plan-data">${inspection}</script>
</main></body></html>`;
  requireValue(Buffer.byteLength(html, "utf8") <= MAX_REPORT_BYTES, `complete report exceeds ${MAX_REPORT_BYTES} bytes`);
  return html;
}
