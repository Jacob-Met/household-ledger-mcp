import {
  budgetRemovalSelector, validateBudgetRemovalPreview, validateBudgetRemovalResult,
  type BudgetSelector, type BudgetRemovalResult,
} from "./budget-removal.js";

export type RemovalToolCall = (name: string, args: Record<string, unknown>) => Promise<unknown>;
export interface RemovalIO { write(text: string): void; readLine(): Promise<string | null> }
/** Keep control characters and directional formatting visible in terminal reviews. */
function literal(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/[\u202a-\u202e\u2066-\u2069]/g,
    char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
}
function payload(value: unknown): unknown {
  const reply = value as { isError?: unknown; content?: Array<{ type?: unknown; text?: unknown }> };
  if (!reply || typeof reply !== "object" || !Array.isArray(reply.content) ||
      reply.content.length !== 1 || reply.content[0]?.type !== "text" || typeof reply.content[0].text !== "string") {
    throw new Error("Unexpected MCP reply; no trustworthy result.");
  }
  if (reply.isError === true) throw new Error(reply.content[0].text);
  if (reply.isError !== undefined && reply.isError !== false) throw new Error("Invalid MCP error flag.");
  return JSON.parse(reply.content[0].text);
}
export function removalEndpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]", "localhost"].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/mcp") {
    throw new Error("Use an explicit loopback HTTP /mcp endpoint without credentials, query or fragment.");
  }
  return url;
}
export async function runBudgetRemoval(
  call: RemovalToolCall, input: BudgetSelector, io: RemovalIO,
): Promise<{ status: "cancelled" } | { status: "removed"; result: BudgetRemovalResult }> {
  const selector = budgetRemovalSelector(input);
  const preview = validateBudgetRemovalPreview(payload(await call("preview_budget_removal", { ...selector })), selector);
  io.write("Review: remove this one budget allowance. Transactions are retained.\n");
  io.write(literal(preview) + "\n");
  io.write("This checks the target's current value, not identical remove/recreate history or other processes.\n");
  const confirmation = "REMOVE " + preview.reviewToken;
  io.write("Type exactly " + confirmation + " to remove it; anything else or EOF cancels:\n");
  const answer = await io.readLine();
  if (answer !== confirmation) {
    io.write("Cancelled. No removal request was sent.\n");
    return { status: "cancelled" };
  }
  // One request only. Even an error reply may follow persistence; never retry.
  let result: BudgetRemovalResult;
  try {
    result = validateBudgetRemovalResult(payload(await call("commit_budget_removal", { ...selector, reviewToken: preview.reviewToken })), preview);
  } catch (error) {
    throw new Error("Removal not confirmed. Do not retry automatically; inspect fresh state before any new action. Detail: " + literal(String(error)));
  }
  io.write("Server confirmed removal of the reviewed budget:\n" + literal(result) + "\n");
  return { status: "removed", result };
}
