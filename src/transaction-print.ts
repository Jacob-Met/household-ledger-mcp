import { createHash } from "node:crypto";
import { listTransactions, validateDate, validateLedgerData, type TransactionType } from "./ledger.js";

export const PRINT_LIMITS = Object.freeze({ sourceBytes: 4 * 1024 * 1024, rows: 5000, htmlBytes: 8 * 1024 * 1024, depth: 32, nodes: 100000 });
export interface PrintOptions { sourceName: string; from: string; to: string; type?: TransactionType; category?: string }
export interface PrintSummary {
  sourceName: string; sourceBytes: number; sourceSha256: string;
  selectors: { from: string; to: string; type?: TransactionType; category?: string };
  matchedRows: number; sourcePositions: number[];
}
export interface TransactionPrint { html: string; summary: PrintSummary }

function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function printable(value: string): string {
  requireValue(typeof value === "string", "Printable text must be a string.");
  requireValue(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value), "Selected text contains an unsupported control character.");
  for (let i = 0; i < value.length; i++) {
    const n = value.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const next = value.charCodeAt(++i);
      requireValue(next >= 0xdc00 && next <= 0xdfff, "Selected text contains an isolated surrogate.");
    } else requireValue(n < 0xdc00 || n > 0xdfff, "Selected text contains an isolated surrogate.");
  }
  return value;
}
function escape(value: string): string {
  return printable(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/\r/g, "&#13;");
}
export function validatePrintOptions(options: PrintOptions): void {
  requireValue(options && typeof options === "object", "Print options are required.");
  requireValue(typeof options.sourceName === "string" && options.sourceName.length > 0, "Source name is required.");
  printable(options.sourceName);
  validateDate(options.from); validateDate(options.to);
  requireValue(options.from <= options.to, "from must be on or before to.");
  requireValue(options.type === undefined || options.type === "income" || options.type === "expense", "type must be income or expense.");
  requireValue(options.category === undefined || (typeof options.category === "string" && options.category.length > 0), "category must be a nonempty exact string.");
  if (options.category !== undefined) printable(options.category);
}
function inspectJson(value: unknown): void {
  let nodes = 0;
  function visit(v: unknown, depth: number): void {
    requireValue(++nodes <= PRINT_LIMITS.nodes, "JSON exceeds the node limit.");
    requireValue(depth <= PRINT_LIMITS.depth, "JSON exceeds the depth limit.");
    if (typeof v === "number") requireValue(Number.isFinite(v), "JSON numbers must be finite.");
    if (v !== null && typeof v === "object") {
      for (const x of Object.values(v)) visit(x, depth + 1);
    }
  }
  visit(value, 0);
}
/** Serialize parsed JSON without losing -0. Strings are checked before JSON escaping. */
function literalJson(value: unknown, depth = 0): string {
  const pad = "  ".repeat(depth), child = "  ".repeat(depth + 1);
  if (typeof value === "string") return JSON.stringify(printable(value));
  if (typeof value === "number") return Object.is(value, -0) ? "-0" : String(value);
  if (value === null || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? "[\n" + value.map(v => child + literalJson(v, depth + 1)).join(",\n") + "\n" + pad + "]" : "[]";
  if (typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length ? "{\n" + entries.map(([k, v]) => child + JSON.stringify(printable(k)) + ": " + literalJson(v, depth + 1)).join(",\n") + "\n" + pad + "}" : "{}";
  }
  throw new Error("Only parsed JSON values can be printed.");
}
const css = `:root{color-scheme:light;font-family:system-ui,sans-serif;color:#192b30;background:#edf2f1}*{box-sizing:border-box}body{margin:0}main{max-width:960px;margin:auto;padding:36px 24px}h1{font-size:2rem;line-height:1.15;margin:.3em 0}h2{font-size:1.15rem}p{line-height:1.55}.eyebrow{letter-spacing:.12em;text-transform:uppercase;font-size:.75rem;color:#3e646a}.scope,article{background:#fff;border:1px solid #c9d8d8;border-radius:12px;padding:20px;margin:20px 0}ol{list-style:none;padding:0}li{margin:0}dl{display:grid;grid-template-columns:175px minmax(0,1fr);gap:10px 18px;margin:12px 0}dt{font-weight:650}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}pre,code{font-family:ui-monospace,monospace;font-size:.9rem;white-space:pre-wrap;overflow-wrap:anywhere;tab-size:4}pre{background:#f2f5f5;padding:14px;border-radius:6px;line-height:1.5}.status{color:#4c6267;font-style:italic}.notice{border-left:4px solid #427d78;padding-left:16px}.count{font-size:1.2rem;font-weight:700}.record-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.position{color:#466267;font-size:.85rem}footer{border-top:1px solid #cad7d7;margin-top:32px;padding-top:16px;font-size:.9rem}@media(max-width:600px){main{padding:20px 12px}h1{font-size:1.6rem}.scope,article{padding:15px}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:10px}}@media print{@page{size:auto;margin:16mm}:root{background:white;color:black}main{max-width:none;padding:0}.scope,article{border-color:#999;border-radius:0;box-shadow:none}article,pre,dd{break-inside:auto;overflow:visible}h2,dt{break-after:avoid}pre{background:white}.eyebrow,.position,.status{color:#333}footer{font-size:9pt}}`;
export function buildTransactionPrint(sourceBytes: Uint8Array, options: PrintOptions): TransactionPrint {
  validatePrintOptions(options);
  requireValue(sourceBytes instanceof Uint8Array, "Source bytes must be a Uint8Array.");
  requireValue(sourceBytes.byteLength <= PRINT_LIMITS.sourceBytes, "Saved ledger exceeds 4 MiB.");
  const bytes = Buffer.from(sourceBytes);
  const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  const raw: unknown = JSON.parse(text);
  inspectJson(raw);
  const ledger = validateLedgerData(raw);
  const selectors = { from: options.from, to: options.to, ...(options.type === undefined ? {} : { type: options.type }), ...(options.category === undefined ? {} : { category: options.category }) };
  const first = listTransactions(ledger, { ...selectors, limit: 1000, offset: 0 });
  requireValue(first.total <= PRINT_LIMITS.rows, "Selection exceeds 5000 rows; choose a narrower range. No partial review was created.");
  const selected = [...first.transactions];
  for (let offset = selected.length; offset < first.total; offset += 1000) {
    selected.push(...listTransactions(ledger, { ...selectors, limit: 1000, offset }).transactions);
  }
  requireValue(selected.length === first.total, "Native selection was incomplete.");
  // JSON.parse creates a distinct object for each saved row, even identical rows and IDs.
  const positions = new Map(ledger.transactions.map((row, index) => [row, index + 1]));
  const summary: PrintSummary = { sourceName: options.sourceName, sourceBytes: bytes.length, sourceSha256: createHash("sha256").update(bytes).digest("hex"), selectors, matchedRows: selected.length, sourcePositions: selected.map(row => positions.get(row)!) };
  const field = (label: string, value: string, name: string) => "<dt>" + escape(label) + '</dt><dd data-field="' + name + '">' + escape(value) + "</dd>";
  const optional = (row: object, key: string): string => {
    if (!Object.hasOwn(row, key)) return '<span class="status" data-presence="missing">Not present in the saved record</span>';
    const v = (row as Record<string, unknown>)[key];
    if (v === "") return '<span class="status" data-presence="empty">Empty string recorded</span>';
    return escape(typeof v === "string" ? v : literalJson(v));
  };
  const cards = selected.map((row, index) => {
    const recordJson = literalJson(row);
    return '<li><article data-source-position="' + summary.sourcePositions[index] + '"><div class="record-head"><h2>Entry ' + (index + 1) + '</h2><p class="position">Saved-array position ' + summary.sourcePositions[index] + '</p></div><dl>' +
      field("Recorded date", row.date, "date") + field("Type", row.type, "type") +
      field("Amount in minor units", String(row.amountMinor), "amountMinor") + field("Recorded currency", row.currency, "currency") +
      field("Recorded category", row.category, "category") + field("Recorded ID", row.id, "id") +
      '<dt>Note</dt><dd data-field="note">' + optional(row, "note") + '</dd><dt>Created-at metadata</dt><dd data-field="createdAt">' + optional(row, "createdAt") + '</dd></dl><h3>Complete parsed record</h3><pre class="record-json">' + escape(recordJson) + "</pre></article></li>";
  }).join("\n");
  const scope = field("Inclusive dates", options.from + " through " + options.to, "range") +
    field("Type selection", options.type ?? "All recorded types", "type-selector") +
    field("Category selection", options.category === undefined ? "All recorded categories" : JSON.stringify(options.category) + " (exact)", "category-selector") +
    field("Source filename", summary.sourceName, "source-name") + field("Source bytes", String(summary.sourceBytes), "source-bytes") + field("Source SHA-256", summary.sourceSha256, "source-sha256");
  const html = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>Selected transaction review</title><style>' + css + '</style></head><body><main><header><p class="eyebrow">Household Ledger · Saved-file review</p><h1>Selected transaction review</h1><p>Read every selected recorded entry, then use your browser’s Print command to print or save a PDF.</p></header><section class="scope" aria-label="Selection and source"><p class="count">' + summary.matchedRows + ' selected recorded ' + (summary.matchedRows === 1 ? "entry" : "entries") + '</p><dl>' + scope + '</dl></section><p class="notice">Amounts are literal integer minor units beside their recorded currency. This review does not calculate totals, balances, budgets or conversions. Repeated IDs remain separate saved rows.</p>' +
    (selected.length ? '<ol aria-label="Selected entries">' + cards + '</ol>' : '<p id="empty-selection">No entries match these exact selectors. This is the complete result.</p>') +
    '<footer><p>Standalone snapshot: no server, network, scripts or automatic saving. The original saved ledger is unchanged. This document contains selected parsed records, not the original JSON formatting. Created-at metadata is retained as recorded and is not validated as a timestamp.</p><p>A local source checksum identifies bytes; it does not authenticate a transaction, bank record, receipt, authorship or payment. Keep this document private if it contains household information.</p></footer></main></body></html>\n';
  requireValue(Buffer.byteLength(html) <= PRINT_LIMITS.htmlBytes, "Complete HTML exceeds 8 MiB; choose a narrower selection. No partial review was created.");
  return { html, summary };
}
