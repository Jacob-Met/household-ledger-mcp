#!/usr/bin/env node
import { constants } from "node:fs";
import { open, link, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareLedgerSnapshot, renderMonthComparison, MonthComparisonError, MAX_SNAPSHOT_BYTES,
} from "./month-comparison.js";

export interface ComparisonArguments {
  ledgerPath: string;
  firstMonth: string;
  secondMonth: string;
  currency: string;
  outputPath: string;
}

export const USAGE =
  "Usage: node dist/src/household-compare.js --ledger FILE --first YYYY-MM --second YYYY-MM --currency CODE --out NEW.html\n" +
  "Create one offline comparison from one complete saved ledger snapshot. Changes are second minus first.\n" +
  "Both months and the currency are explicit. The ledger and existing output files are never replaced.\n";

export function parseComparisonArguments(argv: readonly string[]): ComparisonArguments | null {
  if (argv.length === 1 && argv[0] === "--help") return null;
  const allowed = new Set(["--ledger", "--first", "--second", "--currency", "--out"]);
  const supplied = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!allowed.has(name)) throw new MonthComparisonError("unknown argument; use --help for the five explicit options");
    if (supplied.has(name)) throw new MonthComparisonError("duplicate argument " + name);
    const value = argv[index + 1];
    if (value === undefined || value.length === 0 || value.startsWith("--")) {
      throw new MonthComparisonError("missing value for " + name);
    }
    supplied.set(name, value);
  }
  for (const name of allowed) {
    if (!supplied.has(name)) throw new MonthComparisonError("missing required argument " + name);
  }
  const ledgerPath = resolve(supplied.get("--ledger")!);
  const outputPath = resolve(supplied.get("--out")!);
  if (ledgerPath === outputPath) throw new MonthComparisonError("output must be a new file, distinct from the selected ledger");
  return {
    ledgerPath, outputPath,
    firstMonth: supplied.get("--first")!,
    secondMonth: supplied.get("--second")!,
    currency: supplied.get("--currency")!,
  };
}

/**
 * One read-only descriptor supplies the complete byte snapshot. O_NONBLOCK
 * permits nonregular inputs such as FIFOs to be refused without waiting.
 * Atomic replacement of the path does not relabel the captured descriptor.
 */
export async function readLedgerSnapshot(path: string): Promise<Uint8Array> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new MonthComparisonError("ledger input must be a regular file");
    if (before.size === 0n || before.size > BigInt(MAX_SNAPSHOT_BYTES)) {
      throw new MonthComparisonError("ledger input must contain 1 through " + MAX_SNAPSHOT_BYTES + " bytes");
    }
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, null);
      if (result.bytesRead === 0) break;
      length += result.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (length !== Number(before.size) || after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) {
      throw new MonthComparisonError("ledger input changed during reading; select a stable saved snapshot");
    }
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

function conciseError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unexpected report failure";
  return message.replace(/[\u0000-\u001f\u007f]/g, character =>
    "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
  ).slice(0, 500);
}

export async function runComparisonCli(argv: readonly string[]): Promise<number> {
  let phase: "input" | "output" = "input";
  let temporaryPath: string | null = null;
  let publishedPath: string | null = null;
  try {
    const args = parseComparisonArguments(argv);
    if (args === null) {
      process.stdout.write(USAGE);
      return 0;
    }
    const bytes = await readLedgerSnapshot(args.ledgerPath);
    const report = compareLedgerSnapshot(bytes, {
      firstMonth: args.firstMonth,
      secondMonth: args.secondMonth,
      currency: args.currency,
      sourceLabel: basename(args.ledgerPath),
    });
    // All admission, arithmetic and rendering finish before publication starts.
    const html = renderMonthComparison(report);
    phase = "output";
    const temporary = join(dirname(args.outputPath), ".household-compare-" + randomUUID() + ".tmp");
    const handle = await open(temporary, "wx", 0o600);
    temporaryPath = temporary;
    try {
      try {
        await handle.writeFile(html, "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      // Publish only a completed file, without replacing any existing path.
      await link(temporary, args.outputPath);
      publishedPath = args.outputPath;
    } finally {
      await rm(temporary, { force: true });
      temporaryPath = null;
    }
    process.stdout.write("Created comparison: " + args.outputPath + "\n");
    process.stdout.write(report.firstMonth + " -> " + report.secondMonth + " | " +
      report.currency + " | " + report.categories.length + " complete categories\n");
    return 0;
  } catch (error) {
    process.stderr.write("Comparison refused: " + conciseError(error) + "\n");
    if (publishedPath !== null) {
      process.stderr.write("Completed report bytes were linked at " + publishedPath + "; final cleanup failed.\n");
    }
    if (temporaryPath !== null) {
      process.stderr.write("An owned temporary report may remain at " + temporaryPath + "; inspect it before retrying.\n");
    }
    return phase === "output" ? 1 : 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runComparisonCli(process.argv.slice(2));
}
