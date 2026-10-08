/** Reviewed movement of budget allowance; does not change transactions. */
import { createHash } from "node:crypto";
import { LedgerStore, ValidationError, validateMonth, type Budget, type LedgerData } from "./ledger.js";

export const BUDGET_REALLOCATION_SCHEMA = "household-budget-reallocation/1";
export interface BudgetReallocationReview {
  schema: typeof BUDGET_REALLOCATION_SCHEMA;
  month: string;
  currency: string;
  amountMinor: number;
  totalMinor: number;
  from: { category: string; beforeMinor: number; afterMinor: number };
  to: { category: string; beforeMinor: number; afterMinor: number };
  /** A content digest, not authentication, approval evidence or a ledger lock. */
  reviewToken: string;
}
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}
function object(value: unknown, fields: readonly string[], name: string): Record<string, unknown> {
  requireValue(typeof value === "object" && value !== null && !Array.isArray(value), name + " must be an object");
  const row = value as Record<string, unknown>;
  requireValue(Object.keys(row).length === fields.length && fields.every(key => Object.hasOwn(row, key)), name + " has missing or unsupported fields");
  return row;
}
function category(value: unknown): string {
  requireValue(typeof value === "string" && value.trim().length > 0, "category must be a non-empty literal recorded name");
  return value;
}
function currency(value: unknown): string {
  requireValue(typeof value === "string" && /^[a-zA-Z]{3}$/.test(value.trim()), "currency must be an explicit 3-letter code");
  return value.trim().toUpperCase();
}
function minor(value: unknown, positive = false): number {
  requireValue(typeof value === "number" && Number.isSafeInteger(value) && (positive ? value > 0 : value >= 0),
    positive ? "amountMinor must be a positive safe integer" : "review limits must be non-negative safe integers");
  return value;
}
function token(review: Omit<BudgetReallocationReview, "reviewToken">): string {
  return createHash("sha256").update(JSON.stringify([
    review.schema, review.month, review.currency, review.amountMinor, review.totalMinor,
    review.from.category, review.from.beforeMinor, review.from.afterMinor,
    review.to.category, review.to.beforeMinor, review.to.afterMinor,
  ])).digest("hex");
}
function makeReview(month: string, code: string, from: string, to: string, amount: number, fromBefore: number, toBefore: number): BudgetReallocationReview {
  requireValue(from !== to, "source and destination categories must differ");
  requireValue(fromBefore >= amount, "source budget does not contain that much allowance");
  const total = BigInt(fromBefore) + BigInt(toBefore);
  requireValue(total <= BigInt(Number.MAX_SAFE_INTEGER), "combined budget allowance exceeds the safe integer range");
  const review: Omit<BudgetReallocationReview, "reviewToken"> = {
    schema: BUDGET_REALLOCATION_SCHEMA, month, currency: code, amountMinor: amount, totalMinor: Number(total),
    from: { category: from, beforeMinor: fromBefore, afterMinor: fromBefore - amount },
    to: { category: to, beforeMinor: toBefore, afterMinor: toBefore + amount },
  };
  return { ...review, reviewToken: token(review) };
}
function selected(data: LedgerData, name: string, month: string, code: string): Budget {
  const matches = data.budgets.filter(row => row.category === name && row.month === month &&
    row.currency !== undefined && currency(row.currency) === code);
  requireValue(matches.length === 1, "each selected category must have exactly one existing explicitly denominated budget in this month and currency");
  return matches[0];
}
function readReview(value: unknown): BudgetReallocationReview {
  const raw = object(value, ["schema", "month", "currency", "amountMinor", "totalMinor", "from", "to", "reviewToken"], "review");
  requireValue(raw.schema === BUDGET_REALLOCATION_SCHEMA, "unsupported budget reallocation review schema");
  const from = object(raw.from, ["category", "beforeMinor", "afterMinor"], "review.from");
  const to = object(raw.to, ["category", "beforeMinor", "afterMinor"], "review.to");
  const expected = makeReview(validateMonth(raw.month), currency(raw.currency), category(from.category), category(to.category),
    minor(raw.amountMinor, true), minor(from.beforeMinor), minor(to.beforeMinor));
  requireValue(raw.currency === expected.currency && minor(raw.totalMinor) === expected.totalMinor &&
    minor(from.afterMinor) === expected.from.afterMinor && minor(to.afterMinor) === expected.to.afterMinor &&
    raw.reviewToken === expected.reviewToken, "review content or token changed; preview and review again");
  return expected;
}
export async function previewBudgetReallocation(store: LedgerStore, args: unknown): Promise<BudgetReallocationReview> {
  const raw = object(args, ["month", "currency", "fromCategory", "toCategory", "amountMinor"], "reallocation arguments");
  const month = validateMonth(raw.month), code = currency(raw.currency);
  const from = category(raw.fromCategory), to = category(raw.toCategory), amount = minor(raw.amountMinor, true);
  requireValue(from !== to, "source and destination categories must differ");
  const data = await store.load();
  return makeReview(month, code, from, to, amount,
    selected(data, from, month, code).limitMinor, selected(data, to, month, code).limitMinor);
}
export async function commitBudgetReallocation(store: LedgerStore, args: unknown): Promise<{
  status: "applied" | "already_matching"; review: BudgetReallocationReview;
}> {
  const review = readReview(object(args, ["review"], "commit arguments").review);
  return store.update(data => {
    const from = selected(data, review.from.category, review.month, review.currency);
    const to = selected(data, review.to.category, review.month, review.currency);
    if (from.limitMinor === review.from.afterMinor && to.limitMinor === review.to.afterMinor) {
      // Current-value equality, not a claim that this request previously ran.
      return { status: "already_matching" as const, review };
    }
    requireValue(from.limitMinor === review.from.beforeMinor && to.limitMinor === review.to.beforeMinor,
      "reviewed budget limits changed; no allowance moved. Preview and review again");
    from.limitMinor = review.from.afterMinor;
    to.limitMinor = review.to.afterMinor;
    return { status: "applied" as const, review };
  });
}
const sideSchema = {
  type: "object", additionalProperties: false,
  properties: { category: { type: "string" }, beforeMinor: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, afterMinor: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER } },
  required: ["category", "beforeMinor", "afterMinor"],
} as const;
export const BUDGET_REALLOCATION_TOOL_DEFS = [
  {
    name: "preview_budget_reallocation",
    description: "Review moving an explicit amount of monthly budget allowance between two existing category budgets in one currency. Does not move money or change transactions. Literal category names must match recorded budgets. Review both old/new limits before committing.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: {
        month: { type: "string", description: "YYYY-MM" }, currency: { type: "string", description: "Explicit 3-letter code, normalized to uppercase." },
        fromCategory: { type: "string", description: "Exact recorded source category." },
        toCategory: { type: "string", description: "Exact recorded destination category." },
        amountMinor: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
      },
      required: ["month", "currency", "fromCategory", "toCategory", "amountMinor"],
    },
  },
  {
    name: "commit_budget_reallocation",
    description: "Apply a previously reviewed budget reallocation atomically through the existing Store. Submit the whole unchanged preview as review. Refuses changed limits; preserves unrelated edits. already_matching means current limits match, not proof of prior execution. The digest is not authorization.",
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    inputSchema: {
      type: "object", additionalProperties: false,
      properties: { review: {
        type: "object", additionalProperties: false,
        properties: {
          schema: { type: "string", const: BUDGET_REALLOCATION_SCHEMA },
          month: { type: "string" }, currency: { type: "string" },
          amountMinor: { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
          totalMinor: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
          from: sideSchema, to: sideSchema, reviewToken: { type: "string", pattern: "^[0-9a-f]{64}$" },
        },
        required: ["schema", "month", "currency", "amountMinor", "totalMinor", "from", "to", "reviewToken"],
      } },
      required: ["review"],
    },
  },
] as const;
