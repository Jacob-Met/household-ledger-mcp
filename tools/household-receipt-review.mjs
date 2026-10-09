import { LedgerStore, ValidationError } from "../src/ledger.ts";
import { ReviewError, previewReceiptReview, commitReceiptReview } from "./lib/receipt-review.mjs";

const USAGE = "Usage: node --experimental-transform-types tools/household-receipt-review.mjs --ledger FILE --id ID --state reviewed|unreviewed [--note NOTE]";
function argumentsFor(argv) {
  if (argv.length === 1 && argv[0] === "--help") return null;
  const allowed = new Set(["--ledger", "--id", "--state", "--note"]);
  const values = new Map();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!allowed.has(key) || values.has(key) || i + 1 >= argv.length) throw new ReviewError(USAGE);
    values.set(key, argv[i + 1]);
  }
  for (const key of ["--ledger", "--id", "--state"]) if (!values.has(key)) throw new ReviewError(USAGE);
  if (values.get("--ledger").length === 0) throw new ReviewError("--ledger must be a nonempty literal path");
  return {
    file: values.get("--ledger"),
    input: { id: values.get("--id"), state: values.get("--state"), note: values.get("--note") ?? "" },
  };
}
function output(text) {
  return new Promise((resolve, reject) => {
    const failed = error => { process.stdout.removeListener("error", failed); reject(error); };
    process.stdout.once("error", failed);
    process.stdout.write(text, error => {
      process.stdout.removeListener("error", failed);
      if (error) reject(error); else resolve();
    });
  });
}
async function confirmed() {
  let bytes = [];
  for await (const chunk of process.stdin) {
    for (const byte of chunk) {
      if (byte === 10) {
        if (bytes.length && bytes[bytes.length - 1] === 13) bytes.pop();
        return bytes.length === 7 && bytes.every((b, i) => b === Buffer.from("CONFIRM")[i]);
      }
      if (bytes.length === 8) return false;
      bytes.push(byte);
    }
  }
  return false;
}
async function run() {
  const parsed = argumentsFor(process.argv.slice(2));
  if (parsed === null) { await output(USAGE + "\n"); return; }
  const store = new LedgerStore(parsed.file);
  const preview = await previewReceiptReview(store, parsed.input);
  await output(JSON.stringify(preview) + "\n");
  process.stderr.write("Review the complete receipt above. Type CONFIRM then Enter to save; anything else cancels.\n");
  if (!(await confirmed())) { process.stderr.write("Cancelled; no receipt change.\n"); return; }
  const result = await commitReceiptReview(store, {
    ...parsed.input, expectedDigest: preview.expectedDigest, recordDigest: preview.recordDigest,
  });
  await output(JSON.stringify(result) + "\n");
}
run().catch(error => {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = error instanceof ReviewError || error instanceof ValidationError ? 2 : 1;
});
