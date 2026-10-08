import { createInterface } from "node:readline";
import { realpath } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { prepareRecording, saveRecordingRequest, loadRecordingRequest, recordingPreview, sendRecording, literal, type RecordingRequest } from "./record-client.js";

const HELP = `Record one household entry through an already running local MCP service.

  node dist/src/household-record.js new --endpoint http://127.0.0.1:3000/mcp --request /NEW/private/request.json
  node dist/src/household-record.js resume --request /existing/private/request.json

New asks for direction, positive integer minor units, currency, date, category
and an optional single-line note. It saves a private request before any send.
Both modes display the exact request and require RECORD at an interactive
terminal. Anything else, EOF or Ctrl-C cancels. No automatic retry occurs.
Resume reuses the saved endpoint and key; use the same server/ledger. The file
contains private transaction data. Never make a new key to retry this entry.
This records bookkeeping only; it does not move money.
`;
export async function runRecordCli(argv: string[]): Promise<number> {
  if (argv.length === 1 && ["--help", "-h"].includes(argv[0])) { process.stdout.write(HELP); return 0; }
  const [mode, ...flags] = argv;
  if (!["new", "resume"].includes(mode)) throw new Error(HELP);
  const options = new Map<string, string>();
  for (let i = 0; i < flags.length; i += 2) {
    const name = flags[i], value = flags[i + 1];
    if (!["--endpoint", "--request"].includes(name) || value === undefined || options.has(name)) throw new Error("Use the exact arguments shown by --help.");
    options.set(name, value);
  }
  const path = options.get("--request");
  if (!path || (mode === "new" && !options.has("--endpoint")) || (mode === "resume" && options.has("--endpoint"))) throw new Error("New requires endpoint and a new request path; resume requires only its saved request path.");
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("An interactive input and output terminal is required; no request was sent.");
  const abort = new AbortController();
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  const interrupt = () => { abort.abort(); rl.close(); };
  process.once("SIGINT", interrupt);
  async function ask(label: string): Promise<string | undefined> {
    if (abort.signal.aborted) return undefined;
    process.stdout.write(label);
    const answer = await lines.next();
    return answer.done || abort.signal.aborted ? undefined : answer.value;
  }
  try {
    let request: RecordingRequest;
    if (mode === "new") {
      const raw: Record<string, unknown> = {};
      for (const [key, prompt] of [
        ["type", "Direction (income or expense): "],
        ["amountMinor", "Amount in positive INTEGER minor units: "],
        ["currency", "Three-letter currency: "],
        ["date", "Date (YYYY-MM-DD): "],
        ["category", "Category: "],
        ["note", "Note (single line; blank to omit): "],
      ]) {
        const answer = await ask(prompt);
        if (answer === undefined) { process.stdout.write("\nCanceled; no request sent.\n"); return 2; }
        if (key === "amountMinor") {
          if (!/^[0-9]+$/.test(answer)) throw new Error("Amount must use decimal integer digits, in minor units.");
          raw[key] = Number(answer);
        } else if (key !== "note" || answer !== "") raw[key] = answer;
      }
      request = prepareRecording(options.get("--endpoint")!, raw);
      await saveRecordingRequest(path, request);
      process.stdout.write("Recovery request saved at " + literal(resolve(path)) + ". Keep it until the result is resolved.\n");
    } else request = await loadRecordingRequest(path);
    process.stdout.write(recordingPreview(request));
    const confirm = await ask("Type RECORD to send this exact request once; anything else cancels: ");
    if (confirm !== "RECORD" || abort.signal.aborted) { process.stdout.write("\nCanceled; no record call. Recovery request retained.\n"); return 2; }
    const result = await sendRecording(request, abort.signal);
    if (result.status === "confirmed") {
      process.stdout.write("Confirmed recording: " + literal(result.transaction) + "\nRecovery request retained; this result may be the original record returned for a retry.\n");
      return 0;
    }
    process.stdout.write(result.status === "not_sent" ? "Not sent: " : "UNCONFIRMED: ");
    process.stdout.write(literal(result.message) + "\nRecovery request retained. Do not create a replacement key. Review with resume before any explicit retry.\n");
    return 3;
  } finally { process.removeListener("SIGINT", interrupt); rl.close(); }
}

// Realpath supports normal direct execution and an explicitly created local link.
async function isEntry(): Promise<boolean> {
  if (!process.argv[1]) return false;
  try { return await realpath(process.argv[1]) === await realpath(fileURLToPath(import.meta.url)); }
  catch { return false; }
}
if (await isEntry()) runRecordCli(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
  process.stderr.write("Recording refused: " + literal(error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
