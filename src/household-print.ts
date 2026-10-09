import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, open, realpath, link, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildTransactionPrint, PRINT_LIMITS, validatePrintOptions, type PrintOptions } from "./transaction-print.js";

const usage = "Usage: node dist/src/household-print.js --ledger FILE --from YYYY-MM-DD --to YYYY-MM-DD --out NEW.html [--type income|expense] [--category EXACT]";
export interface PrintFileOptions extends Omit<PrintOptions, "sourceName"> { ledger: string; out: string }
function same(a: BigIntStats, b: BigIntStats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
}
async function snapshot(path: string): Promise<{ bytes: Buffer; stat: BigIntStats }> {
  const before = await lstat(path, { bigint: true });
  if (!before.isFile()) throw new Error("Ledger input must be a regular file, not a directory or symlink.");
  if (before.size > BigInt(PRINT_LIMITS.sourceBytes)) throw new Error("Saved ledger exceeds 4 MiB.");
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const initial = await file.stat({ bigint: true });
    if (!same(before, initial)) throw new Error("Ledger source changed while opening.");
    const buffer = Buffer.alloc(PRINT_LIMITS.sourceBytes + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await file.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length > PRINT_LIMITS.sourceBytes) throw new Error("Saved ledger exceeds 4 MiB.");
    const after = await file.stat({ bigint: true });
    const current = await lstat(path, { bigint: true });
    if (!same(initial, after) || !same(after, current) || BigInt(length) !== after.size) throw new Error("Ledger source changed during snapshot.");
    return { bytes: Buffer.from(buffer.subarray(0, length)), stat: after };
  } finally { await file.close(); }
}
async function requireAbsent(path: string): Promise<void> {
  try { await lstat(path); } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
  throw new Error("Output already exists; choose a new path. Files and symlinks are never replaced.");
}
export async function printLedgerFile(options: PrintFileOptions) {
  if (typeof options.ledger !== "string" || !options.ledger || typeof options.out !== "string" || !options.out) throw new Error("Explicit ledger and output paths are required.");
  const sourcePath = resolve(options.ledger);
  const targetParent = await realpath(dirname(resolve(options.out)));
  if (!(await lstat(targetParent)).isDirectory()) throw new Error("Output parent must be an existing directory.");
  const target = join(targetParent, basename(resolve(options.out)));
  const printOptions: PrintOptions = { sourceName: basename(sourcePath), from: options.from, to: options.to, ...(options.type === undefined ? {} : { type: options.type }), ...(options.category === undefined ? {} : { category: options.category }) };
  validatePrintOptions(printOptions);
  await requireAbsent(target);
  const original = await snapshot(sourcePath);
  const document = buildTransactionPrint(original.bytes, printOptions);
  const bytes = Buffer.from(document.html);
  const temporary = join(targetParent, ".household-print-" + randomUUID() + ".tmp");
  let ownTemporary = false;
  try {
    const file = await open(temporary, "wx", 0o600);
    ownTemporary = true;
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    const current = await snapshot(sourcePath);
    if (!same(original.stat, current.stat) || !original.bytes.equals(current.bytes)) throw new Error("Ledger source changed before publication; output was not created.");
    // Atomic exclusive name publication. A competing destination is never overwritten.
    await link(temporary, target);
  } finally {
    if (ownTemporary) await unlink(temporary);
  }
  return { format: "household-transaction-print/1", ...document.summary, sourcePath, outputPath: target, outputBytes: bytes.length, outputSha256: createHash("sha256").update(bytes).digest("hex") };
}
export function parsePrintArguments(args: string[]): PrintFileOptions {
  const names = new Map([["--ledger", "ledger"], ["--out", "out"], ["--from", "from"], ["--to", "to"], ["--type", "type"], ["--category", "category"]]);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const key = names.get(args[i]);
    if (!key || Object.hasOwn(parsed, key) || i + 1 >= args.length) throw new Error("Unknown, duplicate or missing argument. " + usage);
    parsed[key] = args[++i];
  }
  for (const key of ["ledger", "out", "from", "to"]) if (!parsed[key]) throw new Error("Missing required --" + key + ". " + usage);
  return parsed as unknown as PrintFileOptions;
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  if (args.length === 1 && args[0] === "--help") { console.log(usage); return; }
  const receipt = await printLedgerFile(parsePrintArguments(args));
  console.log(JSON.stringify(receipt));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error("household-print: " + (error instanceof Error ? error.message : String(error))); process.exitCode = 2; });
}
