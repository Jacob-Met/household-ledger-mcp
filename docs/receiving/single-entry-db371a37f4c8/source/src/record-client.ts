import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open, lstat } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { emptyLedger, recordTransaction, type RecordTransactionInput, type Transaction, ValidationError } from "./ledger.js";

export interface RecordingRequest {
  version: 1;
  endpoint: string;
  transaction: RecordTransactionInput & { idempotencyKey: string };
}
const MAX_REQUEST_BYTES = 65536;
function fail(message: string): never { throw new ValidationError(message); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Expected a JSON object.");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(value).some(k => !allowed.includes(k))) fail("Unexpected request field.");
}

export function recordingEndpoint(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return fail("Endpoint must be an explicit loopback HTTP /mcp URL."); }
  if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) ||
      url.pathname !== "/mcp" || url.search || url.hash || url.username || url.password)
    fail("Endpoint must be http://127.0.0.1:PORT/mcp or http://[::1]:PORT/mcp without credentials, query or fragment.");
  return url.href;
}

/** Preview uses the actual domain validator on a detached, discarded ledger. */
export function prepareRecording(endpoint: string, raw: unknown, key: string = randomUUID()): RecordingRequest {
  const input = object(raw);
  exactKeys(input, ["type", "amountMinor", "currency", "date", "category", "note", "idempotencyKey"]);
  const tx = recordTransaction(emptyLedger(), { ...input, idempotencyKey: input.idempotencyKey === undefined ? key : input.idempotencyKey } as unknown as RecordTransactionInput);
  const { id: _id, createdAt: _createdAt, ...transaction } = tx;
  const result: RecordingRequest = { version: 1, endpoint: recordingEndpoint(endpoint),
    transaction: transaction as RecordingRequest["transaction"] };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > MAX_REQUEST_BYTES) fail("Recording request exceeds 64 KiB.");
  return result;
}

export function parseRecording(raw: unknown): RecordingRequest {
  const value = object(raw);
  exactKeys(value, ["version", "endpoint", "transaction"]);
  if (value.version !== 1 || typeof value.endpoint !== "string") fail("Unsupported recording request.");
  const tx = object(value.transaction);
  if (typeof tx.idempotencyKey !== "string") fail("Recovery request must retain its original idempotencyKey.");
  const normalized = prepareRecording(value.endpoint, tx);
  // A recovery file must already contain the exact reviewed values, not silently
  // become a changed recording after trimming or currency normalization.
  if (normalized.endpoint !== value.endpoint ||
      Object.keys(normalized.transaction).length !== Object.keys(tx).length ||
      Object.entries(normalized.transaction).some(([k, v]) => tx[k] !== v))
    fail("Recovery request is not the exact normalized recording.");
  return normalized;
}

export async function saveRecordingRequest(path: string, request: RecordingRequest): Promise<void> {
  const checked = parseRecording(request);
  const bytes = Buffer.from(JSON.stringify(checked, null, 2) + "\n", "utf8");
  if (bytes.length > MAX_REQUEST_BYTES) fail("Recording request exceeds 64 KiB.");
  // wx refuses existing files and links. A failed write remains as failure
  // evidence; no server call follows. Never replace an older recovery request.
  const handle = await open(path, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); }
  finally { await handle.close(); }
}

export async function loadRecordingRequest(path: string): Promise<RecordingRequest> {
  const before = await lstat(path);
  if (!before.isFile() || before.size > MAX_REQUEST_BYTES) fail("Recovery request must be a regular file of at most 64 KiB.");
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > MAX_REQUEST_BYTES) fail("Recovery request must be a regular file of at most 64 KiB.");
    const bytes = await handle.readFile();
    if (bytes.length > MAX_REQUEST_BYTES) fail("Recovery request exceeds 64 KiB.");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return parseRecording(JSON.parse(text));
  } finally { await handle.close(); }
}

export function literal(value: unknown): string {
  return JSON.stringify(value).replace(/[\p{Cf}\u2028\u2029]/gu, c => c.split("").map(x => "\\u" + x.charCodeAt(0).toString(16).padStart(4, "0")).join(""));
}

export function recordingPreview(request: RecordingRequest): string {
  const checked = parseRecording(request);
  return "Review one recording (amountMinor is an integer, not a decimal amount):\n" +
    Object.entries(checked).map(([key, value]) => "  " + key + ": " + literal(value)).join("\n") + "\n";
}

export function admittedRecordingResponse(request: RecordingRequest, result: unknown): Transaction {
  const response = object(result);
  if (response.isError === true) fail("Service reported an error; a successful recording is not confirmed.");
  if (!Array.isArray(response.content) || response.content.length !== 1) fail("Unexpected service response; recording is unconfirmed.");
  const block = object(response.content[0]);
  if (block.type !== "text" || typeof block.text !== "string" || Buffer.byteLength(block.text) > MAX_REQUEST_BYTES)
    fail("Unexpected service response; recording is unconfirmed.");
  const tx = object(JSON.parse(block.text));
  if (typeof tx.id !== "string" || !tx.id || typeof tx.createdAt !== "string" || !tx.createdAt ||
      Object.entries(request.transaction).some(([k, v]) => tx[k] !== v) ||
      (request.transaction.note === undefined && tx.note !== undefined))
    fail("Service response does not match the reviewed request; recording is unconfirmed.");
  return tx as unknown as Transaction;
}

export type RecordingOutcome =
  | { status: "confirmed"; transaction: Transaction }
  | { status: "not_sent" | "unconfirmed"; message: string };

/** One explicit confirmation permits one call. The SDK is never asked to retry. */
export async function sendRecording(request: RecordingRequest, signal?: AbortSignal): Promise<RecordingOutcome> {
  const checked = parseRecording(request);
  const client = new Client({ name: "household-single-entry", version: "1" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(checked.endpoint), { requestInit: { redirect: "error" } });
  let attempted = false;
  try {
    if (signal?.aborted) return { status: "not_sent", message: "Canceled before connection." };
    await client.connect(transport, { timeout: 15000, signal });
    if (signal?.aborted) return { status: "not_sent", message: "Canceled before recording." };
    attempted = true;
    const result = await client.callTool({ name: "record_transaction", arguments: { ...checked.transaction } }, undefined, { timeout: 15000, signal });
    return { status: "confirmed", transaction: admittedRecordingResponse(checked, result) };
  } catch (error) {
    return { status: attempted ? "unconfirmed" : "not_sent", message: error instanceof Error ? error.message : String(error) };
  } finally { await client.close().catch(() => undefined); }
}
