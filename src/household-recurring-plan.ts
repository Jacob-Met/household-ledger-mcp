import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { identifySnapshot, parseSnapshot } from "./expense-plan.js";
import { captureInput, publishNewReport } from "./household-plan.js";
import { ValidationError } from "./ledger.js";
import { generateRecurringExpensePlan, MAX_RULE_BYTES } from "./recurring-expenses.js";

const USAGE = "Usage: node dist/src/household-recurring-plan.js --rules FILE --month YYYY-MM --out NEW.json\n" +
  "Generate an explicit monthly expense plan from reusable rules. No expenses are recorded.\n" +
  "Use the receipt's currency explicitly with household-plan.js. The plan file itself has no currency.\n" +
  "The input must exist and output must be new; --help alone prints this text.\n";
interface Options { rules: string; month: string; out: string }
function options(argv: string[]): Options {
  const keys = new Set(["rules", "month", "out"]);
  const result: Record<string, string> = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const key = flag.startsWith("--") ? flag.slice(2) : "";
    const value = argv[i + 1];
    if (!keys.has(key) || Object.hasOwn(result, key)) throw new ValidationError("unknown or repeated option: " + flag);
    if (!value || value.startsWith("--")) throw new ValidationError(flag + " requires one value");
    result[key] = value;
  }
  if ([...keys].some(key => !Object.hasOwn(result, key))) throw new ValidationError("all three options are required; use --help");
  return result as unknown as Options;
}

// Await actual stream delivery and consume the paired error event, including EPIPE.
function write(stream: NodeJS.WriteStream, text: string): Promise<void> {
  return new Promise((done, fail) => {
    const onError = (error: Error) => { stream.off("error", onError); fail(error); };
    stream.on("error", onError);
    try {
      stream.write(text, error => {
        if (error) { fail(error); return; }
        stream.off("error", onError);
        done();
      });
    } catch (error) { stream.off("error", onError); fail(error); }
  });
}
async function diagnostic(message: string): Promise<void> {
  try { await write(process.stderr, message + "\n"); } catch { /* Exit status remains nonzero. */ }
}
export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv.length === 1 && argv[0] === "--help") {
    try { await write(process.stdout, USAGE); return 0; }
    catch (error) { await diagnostic("Recurring plan help delivery failed: " + (error as Error).message); return 1; }
  }
  let publication = false;
  let delivered = false;
  try {
    const selected = options(argv);
    const source = await captureInput(selected.rules, MAX_RULE_BYTES, "rules");
    const result = generateRecurringExpensePlan(parseSnapshot(source.bytes, MAX_RULE_BYTES, "rules"), selected.month);
    const planText = JSON.stringify(result.plan, null, 2) + "\n";
    const receipt = {
      schema: "household-recurring-expense-plan-delivery/1",
      month: result.month, currency: result.currency,
      source: identifySnapshot(source.path, source.bytes),
      output: identifySnapshot(resolve(selected.out), Buffer.from(planText, "utf8")),
      occurrences: result.occurrences, skipped: result.skipped,
    };
    const receiptText = JSON.stringify(receipt) + "\n";
    if (Buffer.byteLength(receiptText, "utf8") > 1024 * 1024) throw new ValidationError("complete receipt exceeds 1 MiB");
    publication = true;
    await publishNewReport(selected.out, planText, [source]);
    delivered = true;
    await write(process.stdout, receiptText);
    return 0;
  } catch (error) {
    await diagnostic("Recurring plan refused: " + (error as Error).message +
      (delivered ? "; the complete plan was published, but its receipt was not completely delivered" : ""));
    return publication ? 1 : 2;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(async error => {
    process.exitCode = 1;
    await diagnostic("Recurring plan failed: " + (error as Error).message);
  });
}
