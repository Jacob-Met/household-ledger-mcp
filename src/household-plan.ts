import { constants, promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  identifySnapshot, MAX_LEDGER_BYTES, MAX_PLAN_BYTES, parseSnapshot,
  previewExpensePlan, renderExpensePlan,
} from "./expense-plan.js";
import { ValidationError } from "./ledger.js";

const USAGE = `Usage: node dist/src/household-plan.js --ledger FILE --plan FILE --month YYYY-MM --currency CODE --out NEW.html
Create an offline what-if expense preview. Both inputs must already exist; the output must be new.
The plan schema is household-expense-plan/1 with expenses [{date,category,amountMinor,note?}].
No ledger or budget is changed. Use --help alone for this text.
`;
interface Options { ledger: string; plan: string; month: string; currency: string; out: string }
interface Stamp { dev: string; ino: string; size: string; mtimeNs: string; ctimeNs: string }
export interface CapturedInput { path: string; bytes: Buffer; stamp: Stamp; maximum: number; label: string }

function fail(message: string): never { throw new ValidationError(message); }
function parseOptions(argv: string[]): Options {
  const names = new Set(["ledger", "plan", "month", "currency", "out"]);
  const found: Record<string, string> = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const key = flag.startsWith("--") ? flag.slice(2) : "";
    const value = argv[i + 1];
    if (!names.has(key) || Object.hasOwn(found, key)) fail(`unknown or repeated option: ${flag}`);
    if (value === undefined || value.length === 0 || value.startsWith("--")) fail(`${flag} requires one value`);
    found[key] = value;
  }
  if ([...names].some(key => !Object.hasOwn(found, key))) fail("all five options are required; use --help");
  return found as unknown as Options;
}
function stamp(stats: { dev: bigint; ino: bigint; size: bigint; mtimeNs: bigint; ctimeNs: bigint }): Stamp {
  return { dev: String(stats.dev), ino: String(stats.ino), size: String(stats.size),
    mtimeNs: String(stats.mtimeNs), ctimeNs: String(stats.ctimeNs) };
}
function sameStamp(a: Stamp, b: Stamp): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size &&
    a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}

// Nonblocking open lets a non-regular input refuse without waiting for a FIFO writer.
export async function captureInput(path: string, maximum: number, label: string): Promise<CapturedInput> {
  const selected = resolve(path);
  const handle = await fs.open(selected, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail(`${label} must be a regular file`);
    if (before.size < 1n || before.size > BigInt(maximum)) fail(`${label} must contain 1..${maximum} bytes`);
    const chunks: Buffer[] = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, maximum + 1 - total));
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > maximum) fail(`${label} exceeds ${maximum} bytes`);
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const after = await handle.stat({ bigint: true });
    if (!sameStamp(stamp(before), stamp(after)) || BigInt(total) !== after.size) fail(`${label} changed while being captured`);
    return { path: selected, bytes: Buffer.concat(chunks, total), stamp: stamp(after), maximum, label };
  } finally { await handle.close(); }
}

export async function checkCapturedInputs(inputs: CapturedInput[]): Promise<void> {
  for (const original of inputs) {
    let current: CapturedInput;
    try { current = await captureInput(original.path, original.maximum, original.label); }
    catch (error) { fail(`${original.label} cannot be confirmed before delivery: ${(error as Error).message}`); }
    if (!sameStamp(original.stamp, current.stamp) || !original.bytes.equals(current.bytes)) {
      fail(`${original.label} changed before delivery; create a new preview from the intended inputs`);
    }
  }
}

// Complete the owned temporary file, then confirm sources and publish by exclusive link.
// This checks the captured source at delivery time; it does not create a writer lock.
export async function publishNewReport(path: string, html: string, inputs: CapturedInput[]): Promise<void> {
  const destination = resolve(path);
  const parent = dirname(destination);
  const parentStat = await fs.stat(parent);
  if (!parentStat.isDirectory()) throw new Error("output parent must be an existing directory");
  const temporary = resolve(parent, `.${basename(destination)}.${process.pid}.${randomUUID()}.tmp`);
  let ownsTemporary = false;
  let delivered = false;
  let failure: unknown;
  try {
    const handle = await fs.open(temporary, "wx", 0o600);
    ownsTemporary = true;
    try {
      await handle.writeFile(html, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await checkCapturedInputs(inputs);
    await fs.link(temporary, destination);
    delivered = true;
  } catch (error) { failure = error; }
  if (ownsTemporary) {
    try { await fs.unlink(temporary); }
    catch (error) {
      throw new Error(`${failure ? `${(failure as Error).message}; ` : ""}temporary cleanup failed at ${temporary}: ${(error as Error).message}${delivered ? `; complete report already exists at ${destination}` : ""}`);
    }
  }
  if (failure) throw failure;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  if (argv.length === 1 && argv[0] === "--help") { process.stdout.write(USAGE); return 0; }
  let publishing = false;
  try {
    const options = parseOptions(argv);
    const ledger = await captureInput(options.ledger, MAX_LEDGER_BYTES, "ledger");
    const plan = await captureInput(options.plan, MAX_PLAN_BYTES, "plan");
    const preview = previewExpensePlan(
      parseSnapshot(ledger.bytes, MAX_LEDGER_BYTES, "ledger"),
      parseSnapshot(plan.bytes, MAX_PLAN_BYTES, "plan"),
      options.month, options.currency,
    );
    const html = renderExpensePlan(preview, {
      ledger: identifySnapshot(ledger.path, ledger.bytes), plan: identifySnapshot(plan.path, plan.bytes),
      generatedAt: new Date().toISOString(),
    });
    publishing = true;
    await publishNewReport(options.out, html, [ledger, plan]);
    process.stdout.write(`Created expense-plan preview: ${resolve(options.out)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`Expense-plan preview refused: ${(error as Error).message}\n`);
    return error instanceof ValidationError || !publishing ? 2 : 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    process.stderr.write(`Expense-plan preview failed: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
