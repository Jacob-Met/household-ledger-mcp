/** Bounded CSV admission for the existing native transaction input schema. */
import { createHash } from "node:crypto";
import { emptyLedger, recordTransaction, ValidationError, type RecordTransactionInput } from "./ledger.js";

export const MAX_IMPORT_BYTES = 256 * 1024;
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_FIELD_BYTES = 8192;

const REQUIRED = ["idempotencyKey", "type", "amountMinor", "currency", "date", "category"] as const;
const ALLOWED = new Set<string>([...REQUIRED, "note"]);

export interface TransactionCsvRow {
  /** Physical CSV line on which this record begins, including quoted newlines. */
  line: number;
  input: RecordTransactionInput & { idempotencyKey: string };
}

export interface ParsedTransactionCsv {
  sourceSha256: string;
  rows: TransactionCsvRow[];
}

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ValidationError(message);
}

/** Strict comma-separated records, preserving literal quoted field contents. */
function readRecords(source: string): Array<{ line: number; fields: string[] }> {
  const records: Array<{ line: number; fields: string[] }> = [];
  let fields: string[] = [];
  let field = "";
  let mode: "start" | "plain" | "quoted" | "closed" = "start";
  let line = 1;
  let rowLine = 1;
  let started = false;

  function append(value: string): void {
    field += value;
    requireValue(field.length <= MAX_IMPORT_FIELD_BYTES, `CSV line ${rowLine}: field exceeds ${MAX_IMPORT_FIELD_BYTES} UTF-8 bytes`);
  }
  function finishField(): void {
    requireValue(Buffer.byteLength(field, "utf8") <= MAX_IMPORT_FIELD_BYTES,
      `CSV line ${rowLine}: field exceeds ${MAX_IMPORT_FIELD_BYTES} UTF-8 bytes`);
    fields.push(field);
    field = "";
    mode = "start";
  }
  function finishRecord(): void {
    finishField();
    records.push({ line: rowLine, fields });
    requireValue(records.length <= MAX_IMPORT_ROWS + 1, `CSV may contain at most ${MAX_IMPORT_ROWS} transaction rows`);
    fields = [];
    started = false;
  }

  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (mode === "quoted") {
      if (c === '"') {
        if (source[i + 1] === '"') { append('"'); i++; }
        else mode = "closed";
      } else {
        append(c);
        if (c === "\r") {
          if (source[i + 1] === "\n") { append("\n"); i++; }
          line++;
        } else if (c === "\n") line++;
      }
      continue;
    }
    if (c === ",") {
      finishField();
      started = true;
    } else if (c === "\r" || c === "\n") {
      finishRecord();
      if (c === "\r" && source[i + 1] === "\n") i++;
      line++;
      rowLine = line;
    } else if (c === '"') {
      requireValue(mode === "start", `CSV line ${line}: quote inside an unquoted field`);
      mode = "quoted";
      started = true;
    } else {
      requireValue(mode !== "closed", `CSV line ${line}: unexpected text after a closing quote`);
      mode = "plain";
      append(c);
      started = true;
    }
  }
  requireValue(mode !== "quoted", `CSV line ${rowLine}: unterminated quoted field`);
  if (started || fields.length > 0 || mode !== "start") finishRecord();
  return records;
}

export function parseTransactionCsv(value: unknown): ParsedTransactionCsv {
  requireValue(typeof value === "string", "csv must be a string containing the complete CSV, not a file path");
  requireValue(Buffer.byteLength(value, "utf8") <= MAX_IMPORT_BYTES, `CSV exceeds ${MAX_IMPORT_BYTES} UTF-8 bytes`);
  requireValue(Buffer.from(value, "utf8").toString("utf8") === value, "CSV contains invalid Unicode");
  const sourceSha256 = createHash("sha256").update(value, "utf8").digest("hex");
  const records = readRecords(value.startsWith("\uFEFF") ? value.slice(1) : value);
  requireValue(records.length > 0, "CSV needs a header row");
  const headers = records[0].fields;
  requireValue(new Set(headers).size === headers.length, "CSV headers must not repeat");
  requireValue(headers.every(header => ALLOWED.has(header)),
    "CSV headers must be idempotencyKey,type,amountMinor,currency,date,category and optional note; unsupported fields are not discarded");
  requireValue(REQUIRED.every(header => headers.includes(header)),
    "CSV requires idempotencyKey,type,amountMinor,currency,date,category; no transaction defaults are inferred");

  const keys = new Set<string>();
  const validationLedger = emptyLedger();
  const rows = records.slice(1).map(({ line, fields }): TransactionCsvRow => {
    requireValue(fields.length === headers.length, `CSV line ${line}: expected ${headers.length} fields, received ${fields.length}`);
    const cells = new Map(headers.map((header, index) => [header, fields[index]]));
    const amount = cells.get("amountMinor")!;
    requireValue(/^[0-9]+$/.test(amount), `CSV line ${line}: amountMinor must contain decimal integer digits, without a sign, separator or fraction`);
    const key = cells.get("idempotencyKey")!;
    requireValue(!keys.has(key), `CSV line ${line}: repeated idempotencyKey within this CSV; every row needs a distinct logical recording key`);
    const input = {
      idempotencyKey: key,
      type: cells.get("type")!,
      amountMinor: Number(amount),
      currency: cells.get("currency")!,
      date: cells.get("date")!,
      category: cells.get("category")!,
      ...(cells.has("note") ? { note: cells.get("note")! } : {}),
    } as RecordTransactionInput;
    try {
      // Reuse the actual domain admission/normalization. Generated identity and
      // time are deliberately excluded: these are not yet recorded transactions.
      const tx = recordTransaction(validationLedger, input);
      keys.add(key);
      return {
        line,
        input: {
          idempotencyKey: tx.idempotencyKey!, type: tx.type, amountMinor: tx.amountMinor,
          currency: tx.currency, date: tx.date, category: tx.category,
          ...(tx.note !== undefined ? { note: tx.note } : {}),
        },
      };
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(`CSV line ${line}: ${error.message}`);
      throw error;
    }
  });
  return { sourceSha256, rows };
}
