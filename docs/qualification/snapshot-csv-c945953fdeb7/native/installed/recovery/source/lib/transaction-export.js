/**
 * Bounded, read-only transaction statements. Selection and order stay with the
 * native listing function; CSV is returned to the client, never written here.
 */
import { createHash } from "node:crypto";
import { listTransactions, ValidationError } from "./ledger.js";
const MAX_ROWS = 5000;
const MAX_BYTES = 1048576;
const PAGE_SIZE = 1000;
const COLUMNS = ["id", "type", "amountMinor", "currency", "date", "category", "note", "idempotencyKey", "createdAt"];
const SELECTORS = new Set(["type", "category", "from", "to"]);
export const TRANSACTION_EXPORT_TOOL_DEF = {
    name: "export_transactions_csv",
    description: "Prepare a complete CSV statement of matching transactions, up to 5000 rows and 1 MiB UTF-8. Returns CSV text and metadata for the client to save; does not write a file. Stored text remains literal, including formula-like strings. Amounts remain integer minor units with their original currencies.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    inputSchema: {
        type: "object",
        properties: {
            type: { type: "string", enum: ["income", "expense"] },
            category: { type: "string", description: "Exact category selector, with the same case and whitespace behavior as list_transactions." },
            from: { type: "string", description: "YYYY-MM-DD inclusive, using the existing transaction listing." },
            to: { type: "string", description: "YYYY-MM-DD inclusive, using the existing transaction listing." },
        },
        additionalProperties: false,
    },
};
function selectors(args) {
    if (typeof args !== "object" || args === null || Array.isArray(args)) {
        throw new ValidationError("CSV export arguments must be an object");
    }
    for (const key of Object.keys(args)) {
        if (!SELECTORS.has(key))
            throw new ValidationError("Unsupported CSV export argument: " + key);
    }
    const filter = args;
    for (const key of ["category", "from", "to"]) {
        if (filter[key] !== undefined && typeof filter[key] !== "string") {
            throw new ValidationError(key + " must be a string");
        }
    }
    // The existing listing validates type and calendar dates, and owns matching.
    return filter;
}
function byteLimit() {
    throw new ValidationError("Matching transactions exceed the 1048576-byte UTF-8 CSV limit; narrow the selection");
}
function encodeRow(values, remaining) {
    let bytes = values.length - 1 + 2; // commas and final CRLF
    const cells = [];
    for (const value of values) {
        if (typeof value !== "string") {
            throw new ValidationError("Selected transaction CSV fields must be strings when present");
        }
        let quotes = 0;
        for (let i = 0; i < value.length; i++) {
            const code = value.charCodeAt(i);
            if (code === 34)
                quotes++;
            if (code >= 0xd800 && code <= 0xdbff) {
                const low = value.charCodeAt(++i);
                if (!(low >= 0xdc00 && low <= 0xdfff)) {
                    throw new ValidationError("Selected transaction text cannot be represented losslessly as UTF-8");
                }
            }
            else if (code >= 0xdc00 && code <= 0xdfff) {
                throw new ValidationError("Selected transaction text cannot be represented losslessly as UTF-8");
            }
        }
        bytes += Buffer.byteLength(value, "utf8") + quotes + 2;
        if (bytes > remaining)
            byteLimit();
        cells.push(value);
    }
    return { text: cells.map(value => '"' + value.replace(/"/g, '""') + '"').join(",") + "\r\n", bytes };
}
function transactionCells(row) {
    return [
        row.id, row.type, String(row.amountMinor), row.currency, row.date, row.category,
        row.note === undefined ? "" : row.note,
        row.idempotencyKey === undefined ? "" : row.idempotencyKey,
        row.createdAt === undefined ? "" : row.createdAt,
    ];
}
/** The caller supplies one loaded snapshot; this function performs no I/O. */
export function exportTransactionsCsv(snapshot, args = {}) {
    const filter = selectors(args);
    const first = listTransactions(snapshot, { ...filter, limit: PAGE_SIZE, offset: 0 });
    if (first.total > MAX_ROWS) {
        throw new ValidationError("Matching transactions exceed the 5000-row CSV limit; narrow the selection");
    }
    const header = encodeRow(COLUMNS, MAX_BYTES);
    const parts = [header.text];
    let byteCount = header.bytes;
    let rowCount = 0;
    for (let offset = 0; offset < first.total; offset += PAGE_SIZE) {
        const page = offset === 0 ? first : listTransactions(snapshot, { ...filter, limit: PAGE_SIZE, offset });
        for (const transaction of page.transactions) {
            const row = encodeRow(transactionCells(transaction), MAX_BYTES - byteCount);
            parts.push(row.text);
            byteCount += row.bytes;
            rowCount++;
        }
    }
    const csv = parts.join("");
    return {
        format: "csv", filename: "household-transactions.csv", mediaType: "text/csv; charset=utf-8",
        rowCount, byteCount, sha256: createHash("sha256").update(csv, "utf8").digest("hex"), csv,
    };
}
//# sourceMappingURL=transaction-export.js.map