/**
 * stdio entrypoint: local process-spawned development only.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, resolveDataPath } from "./index.js";
import { LedgerStore } from "./ledger.js";

async function main(): Promise<void> {
  const store = new LedgerStore(resolveDataPath());
  const server = createMcpServer(store);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
