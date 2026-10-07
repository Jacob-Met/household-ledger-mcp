/**
 * Streamable HTTP entrypoint.
 *
 * Binds 127.0.0.1 only by default. Non-loopback binds are refused until
 * authentication and deployment controls are implemented.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
    name: "record_transaction",
    description: "Record a household income or expense transaction. Amounts are integer minor units (e.g. cents).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["income", "expense"] },
        amountMinor: { type: "integer", minimum: 1 },
        currency: { type: "string", description: "3-letter currency code, e.g. USD" },
        date: { type: "string", description: "YYYY-MM-DD" },
        category: { type: "string" },
        note: { type: "string" },
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
    description: "Income/expense totals, per-category breakdown, and budget status for one month.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", minimum: 1970, maximum: 9999 },
        month: { type: "integer", minimum: 1, maximum: 12 },
      },
      required: ["year", "month"],
    },
  },
  {
    name: "set_budget",
    description: "Create or replace a category budget (minor units) for a YYYY-MM month.",
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        month: { type: "string", description: "YYYY-MM" },
        limitMinor: { type: "integer", minimum: 0 },
      },
      required: ["category", "month", "limitMinor"],
    },
  },
  {
    name: "get_budgets",
    description: "List category budgets for a YYYY-MM month.",
    inputSchema: {
      type: "object",
      properties: { month: { type: "string", description: "YYYY-MM" } },
      required: ["month"],
    },
  },
] as const;

export function createMcpServer(store: LedgerStore): Server {
  const server = new Server({ name: "household-ledger-mcp", version: "0.1.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOL_DEFS] }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      const data = await store.load();
      switch (request.params.name) {
        case "record_transaction": {
          const tx = recordTransaction(data, args as never);
          await store.save(data);
          return { content: [{ type: "text", text: JSON.stringify(tx) }] };
        }
        case "list_transactions": {
          const result = listTransactions(data, args as never);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "monthly_summary": {
          const result = monthlySummary(data, args.year as number, args.month as number);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "set_budget": {
          const budget = setBudget(data, args.category as string, args.month as string, args.limitMinor as number);
          await store.save(data);
          return { content: [{ type: "text", text: JSON.stringify(budget) }] };
        }
        case "get_budgets": {
          const result = getBudgets(data, args.month as string);
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
