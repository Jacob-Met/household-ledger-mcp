/**
 * Streamable HTTP entrypoint.
 *
 * Binds 127.0.0.1 only by default. Non-loopback binds are refused until
 * authentication and deployment controls are implemented.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { cashflowTrend } from "./cashflow.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  LedgerStore,
  getBudgets,
  listTransactions,
  monthlySummary,
  recordTransaction,
  setBudget,
  ValidationError,
} from "./ledger.js";
import { commitBudgetReallocation, previewBudgetReallocation, BUDGET_REALLOCATION_TOOL_DEFS } from "./budget-reallocation.js";
import { commitTransactionImport, previewTransactionImport, TRANSACTION_IMPORT_TOOL_DEFS } from "./transaction-import.js";

export function resolveDataPath(): string {
  return (
    process.env.HOUSEHOLD_LEDGER_DATA_PATH ||
    join(homedir(), ".local", "share", "household-ledger", "ledger.json")
  );
}

export function resolvePort(): number {
  const raw = process.env.HOUSEHOLD_LEDGER_PORT ?? "3000";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`HOUSEHOLD_LEDGER_PORT must be 1..65535, got ${JSON.stringify(raw)}`);
  }
  return port;
}

const LOOPBACKS = new Set(["127.0.0.1", "::1", "localhost"]);

export function resolveHost(): string {
  const host = process.env.HOUSEHOLD_LEDGER_HOST ?? "127.0.0.1";
  if (!LOOPBACKS.has(host)) {
    throw new Error(
      `Refusing non-loopback bind ${JSON.stringify(host)}: authentication and deployment controls are not implemented.`
    );
  }
  return host;
}

const TOOL_DEFS = [
  {
    name: "cashflow_trend",
    description: "Read a 1–120 month income/expense series in one currency, including empty months, existing category/budget results and cumulative period net. Cumulative net starts at zero for the interval and is not an account balance. No conversion or write is performed.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
      type: "object",
      properties: {
        fromMonth: { type: "string", description: "Inclusive YYYY-MM, year 1970..9999." },
        toMonth: { type: "string", description: "Inclusive YYYY-MM, on or after fromMonth; at most 120 months including both endpoints." },
        currency: { type: "string", description: "Optional 3-letter selector for the whole interval. Required if its months resolve to multiple currencies. Existing unassigned-budget rules still apply." },
      },
      required: ["fromMonth", "toMonth"],
    },
  },
  {
    name: "record_transaction",
    description: "Record a household income or expense transaction. Amounts are integer minor units (e.g. cents). Reuse an idempotencyKey with the same input to safely retry a recording after a lost response.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        amountMinor: { type: "integer", minimum: 1 },
        currency: { type: "string", description: "3-letter currency code, e.g. USD" },
        date: { type: "string", description: "YYYY-MM-DD" },
        category: { type: "string" },
        note: { type: "string" },
        idempotencyKey: { type: "string", minLength: 1, maxLength: 128, description: "Optional stable key for one logical recording. Exact retries return the original transaction; changed input with the same key is refused. No surrounding whitespace." },
      },
      required: ["type", "amountMinor", "currency", "date", "category"],
    },
  },
  {
    name: "list_transactions",
    description: "List/filter transactions, newest first.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        category: { type: "string" },
        from: { type: "string", description: "YYYY-MM-DD inclusive" },
        to: { type: "string", description: "YYYY-MM-DD inclusive" },
        limit: { type: "integer", minimum: 0, maximum: 1000, default: 50 },
        offset: { type: "integer", minimum: 0, default: 0 },
      },
    },
  },
  {
    name: "monthly_summary",
    description: "Income/expense totals, category breakdown and budgets in one currency for a month. Select currency when transactions or denominated budgets use multiple currencies. Unassigned budgets retain their legacy single-currency rule; ambiguous comparisons require explicit budget assignment.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", minimum: 1970, maximum: 9999 },
        month: { type: "integer", minimum: 1, maximum: 12 },
        currency: { type: "string", description: "Optional 3-letter currency selector. Required when the month's transactions or denominated budgets use multiple currencies; normalized to uppercase. No conversion is performed." },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "set_budget",
    description: "Create or replace a category budget (minor units) for a YYYY-MM month. Supply currency to keep a separate limit for that denomination. Replacing an unassigned budget with a denominated limit also requires replaceUnassigned: true. Omitted currency preserves unassigned-budget behavior and cannot overwrite a denominated budget.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        month: { type: "string", description: "YYYY-MM" },
        limitMinor: { type: "integer", minimum: 0 },
        currency: { type: "string", description: "Optional explicit 3-letter budget currency, normalized to uppercase. Amounts are minor units of this currency." },
        replaceUnassigned: { type: "boolean", description: "Set true to assign the supplied currency and limit to an existing unassigned category/month budget. Requires currency." },
      },
      required: ["category", "month", "limitMinor"],
    },
  },
  {
    name: "get_budgets",
    description: "List category budgets for a YYYY-MM month. Omit currency to include all denominated and unassigned budgets; selecting currency returns only budgets explicitly assigned that denomination.",
    inputSchema: {
      type: "object",
      properties: {
        month: { type: "string", description: "YYYY-MM" },
        currency: { type: "string", description: "Optional 3-letter currency filter for explicitly denominated budgets, normalized to uppercase." },
      },
      required: ["month"],
    },
  },
  ...TRANSACTION_IMPORT_TOOL_DEFS,
  ...BUDGET_REALLOCATION_TOOL_DEFS,
] as const;

export function createMcpServer(store: LedgerStore): Server {
  const server = new Server({ name: "household-ledger-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOL_DEFS] }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      switch (request.params.name) {
        case "preview_budget_reallocation": {
          const result = await previewBudgetReallocation(store, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "commit_budget_reallocation": {
          const result = await commitBudgetReallocation(store, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "preview_transaction_import": {
          const result = await previewTransactionImport(store, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "commit_transaction_import": {
          const result = await commitTransactionImport(store, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "record_transaction": {
          const tx = await store.update(data => recordTransaction(data, args as never));
          return { content: [{ type: "text", text: JSON.stringify(tx) }] };
        }
        case "list_transactions": {
          const result = listTransactions(await store.load(), args as never);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "cashflow_trend": {
          const result = cashflowTrend(await store.load(), args as never);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "monthly_summary": {
          const result = monthlySummary(await store.load(), args.year as number, args.month as number, args.currency as string | undefined);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "set_budget": {
          const budget = await store.update(data => setBudget(data, args.category as string, args.month as string, args.limitMinor as number, args.currency as string | undefined, args.replaceUnassigned as boolean | undefined));
          return { content: [{ type: "text", text: JSON.stringify(budget) }] };
        }
        case "get_budgets": {
          const result = getBudgets(await store.load(), args.month as string, args.currency as string | undefined);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        default:
          return { content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }], isError: true };
      }
    } catch (err) {
      const message = err instanceof ValidationError ? err.message : String((err as Error)?.message ?? err);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  });

  return server;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function main(): Promise<void> {
  const store = new LedgerStore(resolveDataPath());

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.url === "/healthz" && req.method === "GET") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, service: "household-ledger-mcp" }));
        return;
      }
      if (req.url === "/mcp") {
        const body = await readJsonBody(req);
        // Stateless mode: a fresh transport (and server) per request. Reusing
        // one stateless transport across requests throws.
        const requestServer = createMcpServer(store);
        const requestTransport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        try {
          await requestServer.connect(requestTransport);
          await requestTransport.handleRequest(req, res, body);
        } finally {
          await requestTransport.close().catch(() => undefined);
        }
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("request failed", err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "internal error" }));
    }
  });

  const host = resolveHost();
  const port = resolvePort();
  await new Promise<void>((resolve) => httpServer.listen(port, host, resolve));
  // eslint-disable-next-line no-console
  console.log(`household-ledger-mcp listening on http://${host}:${port} (POST /mcp, GET /healthz)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
