/** Preview and commit complete CSV batches through the receiving Store API. */
import { createHash } from "node:crypto";
import { recordTransaction, ValidationError } from "./ledger.js";
import { MAX_IMPORT_BYTES, parseTransactionCsv } from "./transaction-csv.js";
export const TRANSACTION_IMPORT_SCHEMA = "household-transaction-import/1";
function requireValue(condition, message) {
    if (!condition)
        throw new ValidationError(message);
}
function readArguments(args, commit) {
    requireValue(typeof args === "object" && args !== null && !Array.isArray(args), "import arguments must be an object");
    const value = args;
    const allowed = new Set(commit ? ["csv", "reviewToken"] : ["csv"]);
    requireValue(Object.keys(value).every(key => allowed.has(key)), "unsupported import argument; supply csv and, for commit only, reviewToken");
    requireValue(Object.hasOwn(value, "csv"), "csv is required");
    return value;
}
function tokenFor(parsed) {
    return createHash("sha256").update(JSON.stringify([TRANSACTION_IMPORT_SCHEMA, parsed.sourceSha256])).digest("hex");
}
function totalsFor(rows) {
    const totals = new Map();
    for (const { input } of rows) {
        const entry = totals.get(input.currency) ?? { income: 0n, expense: 0n };
        entry[input.type] += BigInt(input.amountMinor);
        requireValue(entry.income <= BigInt(Number.MAX_SAFE_INTEGER) && entry.expense <= BigInt(Number.MAX_SAFE_INTEGER), `CSV ${input.currency} totals exceed the safe integer minor-unit range; use smaller independently reviewed batches`);
        totals.set(input.currency, entry);
    }
    return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, sum]) => ({
        currency, incomeMinor: Number(sum.income), expenseMinor: Number(sum.expense), netMinor: Number(sum.income - sum.expense),
    }));
}
function stage(data, parsed) {
    // The domain recorder only appends to this separate array. No original
    // transaction, budget or version changes while any row remains unqualified.
    const draft = { ...data, transactions: [...data.transactions] };
    const existing = new Map(data.transactions.filter(tx => tx.idempotencyKey !== undefined).map(tx => [tx.idempotencyKey, tx]));
    const results = [];
    const rows = parsed.rows.map((row) => {
        const before = existing.get(row.input.idempotencyKey);
        try {
            const tx = recordTransaction(draft, row.input);
            results.push(tx);
            return { ...row, action: before ? "already_recorded" : "add", ...(before ? { existingTransaction: before } : {}) };
        }
        catch (error) {
            if (!(error instanceof ValidationError) || !before)
                throw error;
            return { ...row, action: "conflict", existingTransaction: before, reason: error.message };
        }
    });
    const counts = {
        total: rows.length,
        add: rows.filter(row => row.action === "add").length,
        alreadyRecorded: rows.filter(row => row.action === "already_recorded").length,
        conflict: rows.filter(row => row.action === "conflict").length,
    };
    const canCommit = counts.total > 0 && counts.conflict === 0;
    const preview = {
        schema: TRANSACTION_IMPORT_SCHEMA, sourceSha256: parsed.sourceSha256,
        reviewToken: canCommit ? tokenFor(parsed) : null, canCommit, counts,
        totals: { allRows: totalsFor(rows), additions: totalsFor(rows.filter(row => row.action === "add")) }, rows,
    };
    return { preview, transactions: draft.transactions, results };
}
export async function previewTransactionImport(store, args) {
    const values = readArguments(args, false);
    const parsed = parseTransactionCsv(values.csv);
    return stage(await store.load(), parsed).preview;
}
export async function commitTransactionImport(store, args) {
    const values = readArguments(args, true);
    const parsed = parseTransactionCsv(values.csv);
    requireValue(parsed.rows.length > 0, "CSV contains no transaction rows to import");
    requireValue(typeof values.reviewToken === "string" && /^[0-9a-f]{64}$/.test(values.reviewToken) && values.reviewToken === tokenFor(parsed), "reviewToken does not match this exact CSV; preview and review its normalized rows before committing");
    return store.update(data => {
        // Recheck every key after the existing serialized queue reads current data.
        const { preview, transactions, results } = stage(data, parsed);
        requireValue(preview.counts.conflict === 0, `Import refused: ${preview.counts.conflict} existing recording key(s) conflict (CSV lines ${preview.rows.filter(row => row.action === "conflict").map(row => row.line).join(", ")}); no rows were saved. Preview again to review the differences.`);
        if (preview.counts.add > 0)
            data.transactions = transactions;
        return {
            schema: TRANSACTION_IMPORT_SCHEMA, sourceSha256: parsed.sourceSha256,
            added: preview.counts.add, alreadyRecorded: preview.counts.alreadyRecorded,
            totals: preview.totals.additions, transactions: results,
        };
    });
}
export const TRANSACTION_IMPORT_TOOL_DEFS = [
    {
        name: "preview_transaction_import",
        description: "Validate and preview a complete CSV of household transactions without writing. Requires a stable native idempotencyKey per row. Shows exact normalized values, original matching/conflicting records and per-currency totals. Review every row before committing; raw CSV is not persisted.",
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        inputSchema: {
            type: "object", additionalProperties: false,
            properties: { csv: { type: "string", maxLength: MAX_IMPORT_BYTES, description: "Complete CSV text, up to 256 KiB UTF-8 and 500 rows. Required headers: idempotencyKey,type,amountMinor,currency,date,category; optional note. Amounts are positive integer minor units. No bank-format inference or missing-field defaults." } },
            required: ["csv"],
        },
    },
    {
        name: "commit_transaction_import",
        description: "After the user reviews the exact normalized CSV preview, import its entire batch atomically through the existing ledger writer. Supply the same CSV and reviewToken. Current matching keys return original records without duplication; any conflict refuses all additions. A retry of the same content is safe. Run one server process per ledger file.",
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        inputSchema: {
            type: "object", additionalProperties: false,
            properties: {
                csv: { type: "string", maxLength: MAX_IMPORT_BYTES, description: "The exact complete CSV text that was reviewed." },
                reviewToken: { type: "string", pattern: "^[0-9a-f]{64}$", description: "Content-binding token returned by preview_transaction_import. It does not lock the ledger or authenticate approval; current keys are rechecked inside the writer." },
            },
            required: ["csv", "reviewToken"],
        },
    },
];
