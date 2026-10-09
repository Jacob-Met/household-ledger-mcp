import { constants, promises as fs, writeSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { validateLedgerData, ValidationError } from "./lib/ledger.js";
import { exportTransactionsCsv } from "./lib/transaction-export.js";

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const OPTIONS = new Set(["ledger", "output", "type", "category", "from", "to"]);
const HELP = [
  "Household saved-ledger CSV",
  "",
  "household-snapshot-csv --ledger FILE.json --output NEW.csv",
  "  [--type income|expense] [--category TEXT] [--from YYYY-MM-DD] [--to YYYY-MM-DD]",
  "",
  "Read one explicit saved JSON ledger and create a complete new CSV statement.",
  "Input: a regular file, at most 8 MiB, with valid UTF-8/JSON and native ledger data.",
  "Output: at most 5,000 matching rows and 1 MiB, preserving native order and literal text.",
  "The output parent must exist. Existing files and links are never overwritten.",
  "Use --help alone. A path named - is an ordinary filename; no stream is inferred.",
  "Exit 0: complete CSV or help; 2: usage/data refusal; 1: filesystem/delivery failure.",
  "A complete CSV can remain if a later receipt-delivery step fails.",
  ""
].join("\n");

class InputError extends Error {}

function writeAll(fd, text) {
  const bytes = Buffer.from(text, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const count = writeSync(fd, bytes, offset, bytes.length - offset);
    if (count === 0) throw new Error("Could not complete output delivery");
    offset += count;
  }
}

function parseArgs(argv) {
  if (argv.length === 1 && argv[0] === "--help") return { help: true };
  const values = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const key = typeof flag === "string" && flag.startsWith("--") ? flag.slice(2) : "";
    if (!OPTIONS.has(key)) throw new InputError("Unknown option: " + JSON.stringify(flag));
    if (values.has(key)) throw new InputError("Repeated option: " + flag);
    if (i + 1 >= argv.length) throw new InputError("Missing value for " + flag);
    values.set(key, argv[i + 1]);
  }
  for (const key of ["ledger", "output"]) {
    if (!values.has(key) || values.get(key).length === 0) {
      throw new InputError("--" + key + " requires an explicit nonempty path");
    }
  }
  const selectors = {};
  for (const key of ["type", "category", "from", "to"]) {
    if (values.has(key)) selectors[key] = values.get(key);
  }
  return { ledger: resolve(values.get("ledger")), output: resolve(values.get("output")), selectors };
}

async function captureLedger(path) {
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) throw new InputError("The ledger must be a regular file");
    if (before.size > BigInt(MAX_INPUT_BYTES)) throw new InputError("The saved ledger exceeds the 8 MiB input limit");
    const bytes = Buffer.allocUnsafe(Number(before.size) + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = await handle.read(bytes, count, bytes.length - count, null);
      if (read.bytesRead === 0) break;
      count += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (BigInt(count) !== before.size || after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs ||
        after.ino !== before.ino || after.dev !== before.dev) {
      throw new InputError("The saved ledger changed while being captured; select a stable saved copy");
    }
    const data = bytes.subarray(0, count);
    return { data, path, bytes: count, sha256: createHash("sha256").update(data).digest("hex") };
  } finally {
    await handle.close();
  }
}

function decodeLedger(bytes) {
  let text;
  try {
    // Retain any BOM so JSON.parse applies its normal admission; never repair bytes.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new InputError("The saved ledger must contain valid UTF-8");
  }
  let raw;
  try { raw = JSON.parse(text); }
  catch { throw new InputError("The saved ledger must contain valid JSON"); }
  return validateLedgerData(raw);
}

async function publishNewCsv(destination, bytes) {
  try {
    await fs.lstat(destination);
    throw new Error("Output already exists: " + JSON.stringify(destination));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const stage = resolve(dirname(destination), ".household-snapshot-csv-" + randomUUID() + ".tmp");
  let handle;
  let created = false;
  let failure;
  let cleanupWarning;
  try {
    handle = await fs.open(stage, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    created = true;
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.link(stage, destination);
  } catch (error) {
    failure = error;
  } finally {
    if (handle) {
      try { await handle.close(); }
      catch (error) { if (!failure) failure = error; }
    }
    if (created) {
      try { await fs.unlink(stage); }
      catch (error) {
        cleanupWarning = "Owned staging file remains at " + JSON.stringify(stage) + ": " + error.message;
      }
    }
  }
  if (failure) {
    if (cleanupWarning) throw new Error(failure.message + "; " + cleanupWarning);
    throw failure;
  }
  return cleanupWarning;
}

let publishedOutput;
try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    writeAll(1, HELP);
  } else {
    if (args.ledger === args.output) throw new Error("CSV output must be a new path different from the saved ledger");
    const captured = await captureLedger(args.ledger);
    const snapshot = decodeLedger(captured.data);
    const result = exportTransactionsCsv(snapshot, args.selectors);
    const csvBytes = Buffer.from(result.csv, "utf8");
    const csvSha = createHash("sha256").update(csvBytes).digest("hex");
    if (csvBytes.length !== result.byteCount || csvSha !== result.sha256) {
      throw new Error("The qualified exporter receipt does not match its complete CSV bytes");
    }
    const warning = await publishNewCsv(args.output, csvBytes);
    publishedOutput = args.output;
    const receipt = {
      format: "household-snapshot-csv",
      version: 1,
      source: { path: captured.path, bytes: captured.bytes, sha256: captured.sha256 },
      selectors: args.selectors,
      output: { path: args.output, rowCount: result.rowCount, byteCount: csvBytes.length, sha256: csvSha }
    };
    if (warning) receipt.warning = warning;
    writeAll(1, JSON.stringify(receipt) + "\n");
  }
} catch (error) {
  process.exitCode = error instanceof InputError || error instanceof ValidationError ? 2 : 1;
  const diagnostic = { error: String(error?.message ?? error) };
  if (publishedOutput) diagnostic.completeOutputRemains = publishedOutput;
  try { writeAll(2, JSON.stringify(diagnostic) + "\n"); } catch {}
}
