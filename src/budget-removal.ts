/** Remove one reviewed, explicitly denominated budget through the existing Store. */
import { createHash } from "node:crypto";
import { LedgerStore, ValidationError, validateMonth, validateLedgerData, type Budget, type LedgerData } from "./ledger.js";

export const BUDGET_REMOVAL_SCHEMA = "household-budget-removal/1";
export interface BudgetSelector { category: string; month: string; currency: string }
export interface BudgetRemovalPreview {
  schema: typeof BUDGET_REMOVAL_SCHEMA;
  selector: BudgetSelector;
  before: Budget;
  reviewToken: string;
}
export interface BudgetRemovalResult {
  schema: typeof BUDGET_REMOVAL_SCHEMA;
  reviewToken: string;
  removed: Budget;
  budgetCountAfter: number;
}
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new ValidationError(message);
}
function record(value: unknown): Record<string, unknown> {
  requireValue(typeof value === "object" && value !== null && !Array.isArray(value), "removal arguments must be an object");
  return value as Record<string, unknown>;
}
export function budgetRemovalSelector(value: unknown, commit = false): BudgetSelector {
  const args = record(value);
  const allowed = commit ? ["category", "month", "currency", "reviewToken"] : ["category", "month", "currency"];
  requireValue(Object.keys(args).every(key => allowed.includes(key)), "unsupported budget removal argument");
  requireValue(["category", "month", "currency"].every(key => Object.hasOwn(args, key)), "category, month and explicit currency are required");
  requireValue(typeof args.category === "string" && args.category.trim().length > 0, "category must be the exact non-empty stored category string");
  requireValue(typeof args.currency === "string" && /^[A-Za-z]{3}$/.test(args.currency.trim()), "currency must be an explicit 3-letter code");
  return { category: args.category, month: validateMonth(args.month), currency: args.currency.trim().toUpperCase() };
}
/** JSON key order is not identity; all values and unknown fields are included. */
function canonical(value: unknown, depth = 0): string {
  requireValue(depth <= 32, "budget review exceeds the supported JSON nesting depth");
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(item => canonical(item, depth + 1)).join(",") + "]";
  requireValue(typeof value === "object" && value !== null, "budget review must contain only JSON values");
  return "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + canonical((value as Record<string, unknown>)[key], depth + 1)).join(",") + "}";
}
function tokenFor(selector: BudgetSelector, before: Budget): string {
  const text = canonical([BUDGET_REMOVAL_SCHEMA, selector, before]);
  requireValue(Buffer.byteLength(text, "utf8") <= 65536, "budget review exceeds 64 KiB; no removal performed");
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function findBudget(data: LedgerData, selector: BudgetSelector): number {
  const matches = data.budgets.map((budget, index) => ({ budget, index })).filter(({ budget }) =>
    budget.category === selector.category && budget.month === selector.month &&
    budget.currency?.trim().toUpperCase() === selector.currency);
  requireValue(matches.length === 1, "exact denominated budget is missing or ambiguous; obtain a fresh review");
  return matches[0].index;
}
/** The existing reader admits 1e400 in unknown fields; JSON.stringify would
 * change that parsed Infinity to null. Refuse before any reviewed removal. */
function requireFiniteJsonNumbers(data: LedgerData): void {
  const pending: unknown[] = [data];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === "number") {
      requireValue(Number.isFinite(value), "ledger has a non-finite JSON number; removal would alter an unrelated value");
    } else if (value !== null && typeof value === "object") {
      for (const child of Object.values(value)) pending.push(child);
    }
  }
}
function previewIn(data: LedgerData, selector: BudgetSelector): BudgetRemovalPreview {
  requireFiniteJsonNumbers(data);
  const before = data.budgets[findBudget(data, selector)];
  const reviewToken = tokenFor(selector, before);
  return { schema: BUDGET_REMOVAL_SCHEMA, selector: { ...selector }, before: JSON.parse(JSON.stringify(before)) as Budget, reviewToken };
}
export async function previewBudgetRemoval(store: LedgerStore, args: unknown): Promise<BudgetRemovalPreview> {
  const selector = budgetRemovalSelector(args);
  return previewIn(await store.load(), selector);
}
export async function commitBudgetRemoval(store: LedgerStore, value: unknown): Promise<BudgetRemovalResult> {
  const args = record(value);
  const selector = budgetRemovalSelector(args, true);
  requireValue(Object.hasOwn(args, "reviewToken") && typeof args.reviewToken === "string" && /^[a-f0-9]{64}$/.test(args.reviewToken), "a reviewed budget removal token is required");
  const reviewedToken = args.reviewToken; // detach before waiting on the Store queue
  return store.update(data => {
    const preview = previewIn(data, selector);
    requireValue(preview.reviewToken === reviewedToken, "selected budget changed since review; no removal performed");
    const index = findBudget(data, selector);
    data.budgets.splice(index, 1);
    return { schema: BUDGET_REMOVAL_SCHEMA, reviewToken: preview.reviewToken, removed: preview.before, budgetCountAfter: data.budgets.length };
  });
}
/** Strict consumer validation before presenting or confirming remote data. */
export function validateBudgetRemovalPreview(value: unknown, selector: BudgetSelector): BudgetRemovalPreview {
  const item = record(value);
  requireValue(item.schema === BUDGET_REMOVAL_SCHEMA, "unexpected removal preview schema");
  requireValue(canonical(budgetRemovalSelector(item.selector)) === canonical(selector), "preview selector differs from requested budget");
  const data = validateLedgerData({ version: 2, transactions: [], budgets: [item.before] });
  const expected = previewIn(data, selector);
  requireValue(item.reviewToken === expected.reviewToken, "preview token does not bind its complete budget");
  return expected;
}
export function validateBudgetRemovalResult(value: unknown, preview: BudgetRemovalPreview): BudgetRemovalResult {
  const item = record(value);
  requireValue(item.schema === BUDGET_REMOVAL_SCHEMA && item.reviewToken === preview.reviewToken, "unexpected removal confirmation");
  requireValue(canonical(item.removed) === canonical(preview.before), "confirmed removed budget differs from review");
  requireValue(Number.isSafeInteger(item.budgetCountAfter) && (item.budgetCountAfter as number) >= 0, "invalid remaining budget count");
  return { schema: BUDGET_REMOVAL_SCHEMA, reviewToken: preview.reviewToken, removed: JSON.parse(JSON.stringify(item.removed)) as Budget, budgetCountAfter: item.budgetCountAfter as number };
}
const selectorProperties = {
  category: { type: "string", description: "Exact stored category string; surrounding whitespace is significant." },
  month: { type: "string", description: "YYYY-MM." },
  currency: { type: "string", description: "Required explicit 3-letter denomination; normalized to uppercase." },
} as const;
export const BUDGET_REMOVAL_TOOL_DEFS = [
  {
    name: "preview_budget_removal",
    description: "Read and review one explicitly denominated budget for removal. Does not write; includes the complete stored budget and a content-binding token, not authorization.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: { type: "object", properties: selectorProperties, required: ["category", "month", "currency"], additionalProperties: false },
  },
  {
    name: "commit_budget_removal",
    description: "Explicitly remove exactly one reviewed budget after rechecking its complete current value. Transactions and other budgets remain unchanged. Missing/stale targets refuse. No cross-process or identical-remove/recreate history guarantee; never automatically retry an uncertain response.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: { type: "object", properties: { ...selectorProperties, reviewToken: { type: "string", pattern: "^[a-f0-9]{64}$" } }, required: ["category", "month", "currency", "reviewToken"], additionalProperties: false },
  },
] as const;
