import { createHash } from "node:crypto";
import { LedgerStore } from "../../src/ledger.ts";

export class ReviewError extends Error {}
const NS = "householdReceiptReview";
const SCHEMA = "household.receipt-review/1";
const MIB = 1024 * 1024;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function requireRule(ok, message) {
  if (!ok) throw new ReviewError(message);
}
function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value, expected, label) {
  requireRule(object(value), label + " must be an object");
  const found = Reflect.ownKeys(value);
  requireRule(found.length === expected.length && expected.every(k => own(value, k)),
    label + " must contain exactly " + expected.join(", "));
}
function lengthWithin(value, minimum, maximum) {
  if (typeof value !== "string") return false;
  let count = 0;
  for (const unused of value) { if (++count > maximum) return false; }
  return count >= minimum;
}
function selectionSnapshot(input, token = false) {
  const fields = token ? ["id", "state", "note", "expectedDigest", "recordDigest"] : ["id", "state", "note"];
  keys(input, fields, "review arguments");
  const snapshot = Object.fromEntries(fields.map(key => [key, input[key]]));
  requireRule(lengthWithin(snapshot.id, 1, 512),
    "id must be a literal string of 1..512 Unicode code points");
  requireRule(snapshot.state === "reviewed" || snapshot.state === "unreviewed", "state must be reviewed or unreviewed");
  requireRule(lengthWithin(snapshot.note, 0, 2048),
    "note must be a literal string of at most 2048 Unicode code points");
  if (token) {
    requireRule(typeof snapshot.expectedDigest === "string" && snapshot.expectedDigest.length === 64 && /^[0-9a-f]{64}$/.test(snapshot.expectedDigest),
      "expectedDigest must be lowercase SHA256 hex");
    requireRule(typeof snapshot.recordDigest === "string" && snapshot.recordDigest.length === 64 && /^[0-9a-f]{64}$/.test(snapshot.recordDigest),
      "recordDigest must be lowercase SHA256 hex");
  }
  return snapshot;
}
function realStore(store) {
  requireRule(store instanceof LedgerStore && Object.getPrototypeOf(store) === LedgerStore.prototype &&
    store.load === LedgerStore.prototype.load && store.update === LedgerStore.prototype.update &&
    store.save === LedgerStore.prototype.save, "store must be the actual unmodified LedgerStore instance");
}
function admitted(data) {
  let nodes = 0;
  function visit(v, depth) {
    requireRule(++nodes <= 100000, "ledger exceeds 100000 JSON value nodes");
    requireRule(depth <= 32, "ledger exceeds JSON depth 32");
    if (v === null || typeof v === "boolean" || typeof v === "string") return;
    if (typeof v === "number") {
      requireRule(Number.isFinite(v) && !Object.is(v, -0), "ledger contains nonfinite number or negative zero");
      return;
    }
    requireRule(typeof v === "object" && v !== null, "ledger contains a non-JSON value");
    if (Array.isArray(v)) {
      for (const child of v) visit(child, depth + 1);
    } else {
      requireRule(Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null,
        "ledger contains a non-JSON object");
      for (const k of Object.keys(v)) visit(v[k], depth + 1);
    }
  }
  visit(data, 0);
  requireRule(Buffer.byteLength(JSON.stringify(data), "utf8") <= 8 * MIB, "ledger exceeds 8MiB compact JSON");
}
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}";
}
function digest(value) {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}
function detached(value) {
  return JSON.parse(JSON.stringify(value));
}
function bounded(result) {
  requireRule(Buffer.byteLength(JSON.stringify(result), "utf8") <= MIB, "review result exceeds 1MiB compact JSON");
  return result;
}
function target(data, id) {
  let match;
  let count = 0;
  for (const transaction of data.transactions) {
    if (transaction.id === id) { match = transaction; count++; }
  }
  requireRule(count === 1, count === 0 ? "receipt ID was not found" : "receipt ID is ambiguous");
  return match;
}
function namespace(transaction) {
  if (!own(transaction, NS)) return undefined;
  const value = transaction[NS];
  keys(value, ["schema", "state", "note", "recordDigest"], "existing review namespace");
  requireRule(value.schema === SCHEMA, "existing review namespace has an unknown schema");
  requireRule(value.state === "reviewed" || value.state === "unreviewed", "existing review state is invalid");
  requireRule(lengthWithin(value.note, 0, 2048), "existing review note is invalid");
  requireRule(typeof value.recordDigest === "string" && value.recordDigest.length === 64 && /^[0-9a-f]{64}$/.test(value.recordDigest),
    "existing review recordDigest is invalid");
  return value;
}
function baseDigest(transaction) {
  const base = Object.create(null);
  for (const k of Object.keys(transaction)) if (k !== NS) base[k] = transaction[k];
  return digest(base);
}
function projectedAdmission(data, transaction, after) {
  admitted({ ...data, transactions: data.transactions.map(t => t === transaction ? after : t) });
}
function desired(input, recordDigest) {
  return { schema: SCHEMA, state: input.state, note: input.note, recordDigest };
}
function sameReview(a, b) {
  return a !== undefined && a.schema === b.schema && a.state === b.state &&
    a.note === b.note && a.recordDigest === b.recordDigest;
}

/** Read the complete real ledger and detach a review proposal without writing. */
export async function previewReceiptReview(store, input) {
  const selected = selectionSnapshot(input);
  realStore(store);
  const data = await store.load();
  admitted(data);
  const transaction = target(data, selected.id);
  const prior = namespace(transaction);
  const recordDigest = baseDigest(transaction);
  const before = detached(transaction);
  const proposed = detached(transaction);
  proposed[NS] = desired(selected, recordDigest);
  projectedAdmission(data, transaction, proposed);
  return bounded({
    id: selected.id, expectedDigest: digest(transaction), recordDigest,
    priorReview: prior === undefined ? "absent" : prior.recordDigest === recordDigest ? "current" : "stale",
    before, proposed,
  });
}

/** Commit only the admitted namespace, after fresh validation inside Store.update. */
export async function commitReceiptReview(store, input) {
  const selected = selectionSnapshot(input, true);
  realStore(store);
  return store.update(data => {
    admitted(data);
    const transaction = target(data, selected.id);
    const prior = namespace(transaction);
    const recordDigest = baseDigest(transaction);
    requireRule(recordDigest === selected.recordDigest, "receipt original fields changed since review");
    const next = desired(selected, recordDigest);
    if (sameReview(prior, next)) {
      return bounded({ status: "already_matching", transaction: detached(transaction) });
    }
    requireRule(digest(transaction) === selected.expectedDigest, "receipt review became stale");
    const after = detached(transaction);
    after[NS] = next;
    projectedAdmission(data, transaction, after);
    const result = bounded({ status: "updated", transaction: after });
    transaction[NS] = next;
    return result;
  });
}
