#!/usr/bin/env node
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { budgetRemovalSelector } from "./budget-removal.js";
import { removalEndpoint, runBudgetRemoval } from "./budget-removal-client.js";

export const REMOVAL_USAGE = "node dist/src/household-remove-budget.js --url http://127.0.0.1:3000/mcp --category \"Exact category\" --month YYYY-MM --currency USD";
export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv.length === 1 && argv[0] === "--help") { console.log(REMOVAL_USAGE); return 0; }
  const values: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!["--url", "--category", "--month", "--currency"].includes(key) || i + 1 >= argv.length || Object.hasOwn(values, key)) {
      throw new Error("Supply each required option once. " + REMOVAL_USAGE);
    }
    values[key] = argv[i + 1];
  }
  if (Object.keys(values).length !== 4) throw new Error("All four options are required. " + REMOVAL_USAGE);
  const url = removalEndpoint(values["--url"]);
  const selector = budgetRemovalSelector({ category: values["--category"], month: values["--month"], currency: values["--currency"] });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator](); // attach before any await, retaining piped input
  const client = new Client({ name: "household-remove-budget", version: "1" }, { capabilities: {} });
  try {
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { redirect: "error" } }));
    const outcome = await runBudgetRemoval(
      async (name, args) => client.callTool({ name, arguments: args }, undefined, { timeout: 15000 }),
      selector,
      { write: text => { process.stdout.write(text); },
        readLine: async () => { const next = await iterator.next(); return next.done ? null : next.value; } },
    );
    return outcome.status === "removed" ? 0 : 2;
  } finally {
    lines.close();
    await client.close().catch(() => undefined);
  }
}
if (process.argv[1] && import.meta.url.toLowerCase() === pathToFileURL(resolve(process.argv[1])).href.toLowerCase()) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error("Budget removal stopped: " + JSON.stringify(String(error)));
    process.exitCode = 1;
  });
}
