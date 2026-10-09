import { createInterface } from "node:readline";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateMonth } from "./ledger.js";
import { ReallocationSession, explicitCurrency, positiveMinorDigits, reallocationEndpoint, reallocationPreview, terminalLiteral } from "./reallocation-client.js";

const HELP = `Review and confirm a change to two monthly category budget allowances.

  node dist/src/household-reallocate.js --endpoint http://127.0.0.1:3000/mcp

Uses an already running local MCP service with the budget-reallocation tools.
Choose a month, explicit currency and two numbered existing category budgets.
Read their exact before/after limits, then type REALLOCATE at a terminal.
Anything else, EOF or Ctrl-C cancels. This moves allowance, not money.
Each run previews freshly and sends at most one commit. No automatic retry.
If a result is uncertain, inspect current budgets before starting another
review; repeating the amount can move allowance again. No durable token or
saved-review recovery is provided. Use one server per configured ledger.
`;
export async function runReallocateCli(argv: string[]): Promise<number> {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) { process.stdout.write(HELP); return 0; }
  if (argv.length !== 2 || argv[0] !== "--endpoint") throw new Error(HELP);
  const endpoint = reallocationEndpoint(argv[1]);
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Interactive input and output terminals are required; no connection was made.");
  const abort = new AbortController();
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const iterator = rl[Symbol.asyncIterator]();
  const interrupt = () => { abort.abort(); rl.close(); };
  process.once("SIGINT", interrupt);
  let session: ReallocationSession | undefined;
  const cancel = () => { process.stdout.write("\nCanceled; no commit call.\n"); return 2; };
  async function ask(prompt: string): Promise<string | undefined> {
    if (abort.signal.aborted) return undefined;
    process.stdout.write(prompt);
    const next = await iterator.next();
    return next.done || abort.signal.aborted ? undefined : next.value;
  }
  try {
    const rawMonth = await ask("Month (YYYY-MM): "); if (rawMonth === undefined) return cancel();
    const month = validateMonth(rawMonth);
    const rawCurrency = await ask("Three-letter currency: "); if (rawCurrency === undefined) return cancel();
    const currency = explicitCurrency(rawCurrency);
    session = new ReallocationSession(endpoint, abort.signal);
    await session.connect();
    const budgets = await session.budgets(month, currency);
    process.stdout.write("Existing explicitly denominated budgets for " + month + " " + currency + " (integer minor units):\n");
    budgets.forEach((b, i) => process.stdout.write("  " + (i + 1) + ". category=" + terminalLiteral(b.category) + " limitMinor=" + b.limitMinor + "\n"));
    if (budgets.length < 2) throw new Error("At least two unambiguous existing category budgets are required; nothing committed.");
    async function choose(prompt: string): Promise<number | undefined> {
      const answer = await ask(prompt);
      if (answer === undefined) return undefined;
      if (!/^[0-9]+$/.test(answer)) throw new Error("Choose one displayed budget number.");
      const index = Number(answer) - 1;
      if (!Number.isSafeInteger(index) || index < 0 || index >= budgets.length) throw new Error("Choose one displayed budget number.");
      return index;
    }
    const from = await choose("Move allowance FROM budget number: "); if (from === undefined) return cancel();
    const to = await choose("Move allowance TO budget number: "); if (to === undefined) return cancel();
    if (from === to) throw new Error("Source and destination must be different categories.");
    const rawAmount = await ask("Amount in positive INTEGER minor units: "); if (rawAmount === undefined) return cancel();
    const review = await session.preview({ month, currency, fromCategory: budgets[from].category, toCategory: budgets[to].category,
      amountMinor: positiveMinorDigits(rawAmount) });
    process.stdout.write(reallocationPreview(endpoint, review));
    const answer = await ask("Type REALLOCATE to commit this exact review once; anything else cancels: ");
    if (answer !== "REALLOCATE" || abort.signal.aborted) return cancel();
    const result = await session.commit(review);
    if (result.status === "applied") {
      process.stdout.write("Applied the reviewed pair of limits. " + terminalLiteral(result.review) + "\n"); return 0;
    }
    if (result.status === "already_matching") {
      process.stdout.write("Current limits already match this review; no write. This does not prove who applied them or that this request ran before.\n" +
        terminalLiteral(result.review) + "\n"); return 0;
    }
    process.stdout.write((result.status === "not_sent" ? "Not sent: " : "UNCONFIRMED: ") + terminalLiteral(result.message) +
      "\nNo automatic retry. Inspect current budgets before any new review; repeating the amount can move allowance again.\n");
    return 3;
  } finally { process.removeListener("SIGINT", interrupt); rl.close(); await session?.close(); }
}
async function isEntry(): Promise<boolean> {
  if (!process.argv[1]) return false;
  try { return await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url)); } catch { return false; }
}
if (await isEntry()) runReallocateCli(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
  process.stderr.write("Reallocation refused: " + terminalLiteral(error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
