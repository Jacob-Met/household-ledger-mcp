import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { validateMonth, type Budget } from "./ledger.js";
import { BUDGET_REALLOCATION_SCHEMA, type BudgetReallocationReview } from "./budget-reallocation.js";

export interface ReallocationInput {
  month: string; currency: string; fromCategory: string; toCategory: string; amountMinor: number;
}
function fail(message: string): never { throw new Error(message); }
function object(value: unknown, keys?: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected an object.");
  const row = value as Record<string, unknown>;
  if (keys && (Object.keys(row).length !== keys.length || keys.some(k => !Object.hasOwn(row, k)))) fail("Unexpected or missing response fields.");
  return row;
}
function minor(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) fail("Limits must be exact nonnegative safe integer minor units.");
  return value;
}
function category(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) fail("Category must be a nonempty literal recorded name.");
  return value;
}
export function explicitCurrency(value: string): string {
  if (!/^[a-zA-Z]{3}$/.test(value.trim())) fail("Use an explicit three-letter currency.");
  return value.trim().toUpperCase();
}
export function reallocationEndpoint(value: string): string {
  let u: URL;
  try { u = new URL(value); } catch { return fail("Use an explicit loopback HTTP /mcp endpoint."); }
  if (u.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(u.hostname) ||
      u.pathname !== "/mcp" || u.search || u.hash || u.username || u.password)
    fail("Use http://127.0.0.1:PORT/mcp or http://[::1]:PORT/mcp without credentials, query or fragment.");
  return u.href;
}
export function terminalLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/[\p{Cf}\u2028\u2029]/gu,
    c => c.split("").map(x => "\\u" + x.charCodeAt(0).toString(16).padStart(4, "0")).join(""));
}
export function positiveMinorDigits(value: string): number {
  if (!/^[0-9]+$/.test(value)) fail("Amount must be positive decimal integer digits, in minor units.");
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) fail("Amount must be a positive safe integer in minor units.");
  return n;
}
function payload(value: unknown): unknown {
  const response = object(value);
  if (response.isError === true) {
    const message = Array.isArray(response.content) && response.content[0]?.type === "text" ? response.content[0].text : "Service refused the request.";
    fail(typeof message === "string" ? message : "Service refused the request.");
  }
  if (!Array.isArray(response.content) || response.content.length !== 1) fail("Unexpected MCP response.");
  const block = object(response.content[0]);
  if (block.type !== "text" || typeof block.text !== "string" || Buffer.byteLength(block.text) > 1024 * 1024)
    fail("Expected one bounded JSON text response.");
  return JSON.parse(block.text);
}
export function admittedBudgets(raw: unknown, month: string, currency: string): Budget[] {
  if (!Array.isArray(raw)) fail("Budget list must be an array.");
  const names = new Set<string>();
  return raw.map(value => {
    const row = object(value);
    const name = category(row.category);
    if (row.month !== month || typeof row.currency !== "string" || explicitCurrency(row.currency) !== currency)
      fail("Budget list does not match the selected month and explicit currency.");
    if (names.has(name)) fail("Ambiguous duplicate category budgets; no reallocation can be selected.");
    names.add(name);
    return { category: name, month, currency: row.currency, limitMinor: minor(row.limitMinor) };
  });
}
export function admittedReview(raw: unknown, input: ReallocationInput): BudgetReallocationReview {
  const r = object(raw, ["schema", "month", "currency", "amountMinor", "totalMinor", "from", "to", "reviewToken"]);
  const from = object(r.from, ["category", "beforeMinor", "afterMinor"]);
  const to = object(r.to, ["category", "beforeMinor", "afterMinor"]);
  if (r.schema !== BUDGET_REALLOCATION_SCHEMA || r.month !== input.month || r.currency !== input.currency ||
      r.amountMinor !== input.amountMinor || from.category !== input.fromCategory || to.category !== input.toCategory ||
      input.fromCategory === input.toCategory) fail("Preview does not match the exact requested reallocation.");
  const fb = minor(from.beforeMinor), fa = minor(from.afterMinor), tb = minor(to.beforeMinor), ta = minor(to.afterMinor), total = minor(r.totalMinor);
  const amount = minor(r.amountMinor);
  if (amount <= 0 || BigInt(fb) - BigInt(amount) !== BigInt(fa) || BigInt(tb) + BigInt(amount) !== BigInt(ta) ||
      BigInt(fb) + BigInt(tb) !== BigInt(total) || BigInt(fa) + BigInt(ta) !== BigInt(total))
    fail("Preview does not conserve the exact paired allowance.");
  const review: BudgetReallocationReview = { schema: BUDGET_REALLOCATION_SCHEMA, month: input.month, currency: input.currency,
    amountMinor: amount, totalMinor: total,
    from: { category: category(from.category), beforeMinor: fb, afterMinor: fa },
    to: { category: category(to.category), beforeMinor: tb, afterMinor: ta }, reviewToken: String(r.reviewToken) };
  const token = createHash("sha256").update(JSON.stringify([review.schema, review.month, review.currency, amount, total,
    review.from.category, fb, fa, review.to.category, tb, ta])).digest("hex");
  if (r.reviewToken !== token) fail("Preview content digest does not match; nothing will be committed.");
  return review;
}
export function reallocationPreview(endpoint: string, review: BudgetReallocationReview): string {
  return "Review monthly budget allowance (integer minor units; no money or transaction changes):\n" +
    "  endpoint: " + terminalLiteral(endpoint) + "\n" +
    Object.entries(review).map(([key, value]) => "  " + key + ": " + terminalLiteral(value)).join("\n") + "\n" +
    "The token is a content digest, not a lock or durable request history. A changed pair will be refused.\n";
}
export type ReallocationOutcome = { status: "applied"; review: BudgetReallocationReview } |
  { status: "already_matching"; review: BudgetReallocationReview } |
  { status: "not_sent" | "unconfirmed"; message: string };

/** A connected run permits at most one explicit commit, including failures. */
export class ReallocationSession {
  private readonly client = new Client({ name: "household-reallocate", version: "1" }, { capabilities: {} });
  private readonly transport: StreamableHTTPClientTransport;
  private attempted = false;
  private displayed?: BudgetReallocationReview;
  readonly endpoint: string;
  constructor(endpoint: string, private readonly signal?: AbortSignal) {
    this.endpoint = reallocationEndpoint(endpoint);
    this.transport = new StreamableHTTPClientTransport(new URL(this.endpoint), { requestInit: { redirect: "error" } });
  }
  async connect(): Promise<void> {
    if (this.signal?.aborted) fail("Canceled before connection.");
    await this.client.connect(this.transport, { timeout: 15000, signal: this.signal });
  }
  private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.signal?.aborted) fail("Canceled before request.");
    return payload(await this.client.callTool({ name, arguments: args }, undefined, { timeout: 15000, signal: this.signal }));
  }
  async budgets(month: string, currency: string): Promise<Budget[]> {
    const mon = validateMonth(month), code = explicitCurrency(currency);
    return admittedBudgets(await this.call("get_budgets", { month: mon, currency: code }), mon, code);
  }
  async preview(input: ReallocationInput): Promise<BudgetReallocationReview> {
    if (this.attempted) fail("This run already attempted its one commit; start a fresh review.");
    this.displayed = undefined;
    const checked = { month: validateMonth(input.month), currency: explicitCurrency(input.currency),
      fromCategory: category(input.fromCategory), toCategory: category(input.toCategory), amountMinor: minor(input.amountMinor) };
    if (checked.amountMinor <= 0 || checked.fromCategory === checked.toCategory) fail("Choose different categories and a positive amount.");
    const review = admittedReview(await this.call("preview_budget_reallocation", { ...checked }), checked);
    this.displayed = structuredClone(review);
    return review;
  }
  async commit(review: BudgetReallocationReview): Promise<ReallocationOutcome> {
    if (this.attempted) return { status: "not_sent", message: "This run already attempted one commit; no retry was sent." };
    if (!this.displayed || JSON.stringify(review) !== JSON.stringify(this.displayed))
      return { status: "not_sent", message: "Commit must use this run's unchanged fresh preview." };
    if (this.signal?.aborted) return { status: "not_sent", message: "Canceled before commit." };
    this.attempted = true;
    try {
      const raw = object(await this.call("commit_budget_reallocation", { review: structuredClone(this.displayed) }), ["status", "review"]);
      const checked = admittedReview(raw.review, { month: review.month, currency: review.currency, fromCategory: review.from.category,
        toCategory: review.to.category, amountMinor: review.amountMinor });
      if (JSON.stringify(checked) !== JSON.stringify(this.displayed) || !["applied", "already_matching"].includes(String(raw.status)))
        fail("Commit result does not match the complete reviewed change.");
      return { status: raw.status as "applied" | "already_matching", review: checked };
    } catch (error) { return { status: "unconfirmed", message: error instanceof Error ? error.message : String(error) }; }
  }
  async close(): Promise<void> { await this.client.close().catch(() => undefined); }
}
