/**
 * Core ledger domain logic: transactions, monthly summaries, category budgets,
 * and atomic JSON persistence. Pure of any transport concerns.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";

/** Highest supported version. Explicitly denominated budgets require version 2. */
export const LEDGER_VERSION = 2;
const LEGACY_LEDGER_VERSION = 1;

export type TransactionType = "income" | "expense";

export interface Transaction {
  id: string;
  type: TransactionType;
  /** Integer minor units (e.g. cents). Always > 0. */
  amountMinor: number;
  currency: string;
  /** ISO calendar date YYYY-MM-DD. */
  date: string;
  category: string;
  note?: string;
  /** Stable caller key for one logical recording, retained across retries. */
  idempotencyKey?: string;
  createdAt: string;
}

export interface Budget {
  /** Category this budget applies to. */
  category: string;
  /** YYYY-MM */
  month: string;
  /** Integer minor units, >= 0. */
  limitMinor: number;
  /** Explicit denomination. Absence preserves a legacy, unassigned budget. */
  currency?: string;
}

export interface LedgerData {
  version: number;
  transactions: Transaction[];
  budgets: Budget[];
}

export interface RecordTransactionInput {
  type: TransactionType;
  amountMinor: number;
  currency: string;
  date: string;
  category: string;
  note?: string;
  idempotencyKey?: string;
}

export interface ListTransactionsFilter {
  type?: TransactionType;
  category?: string;
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
  /** Calendar-date direction; equal dates retain their saved-array order. */
  order?: "newest" | "oldest";
  limit?: number;
  offset?: number;
}

export interface MonthlySummary {
  year: number;
  month: number;
  /** Currency of transaction totals, or null for an empty unselected month. */
  currency: string | null;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  byCategory: Record<string, { incomeMinor: number; expenseMinor: number }>;
  budgets: Array<{
    category: string;
    /** Present only for an explicitly denominated budget. */
    currency?: string;
    limitMinor: number;
    spentMinor: number;
    remainingMinor: number;
    over: boolean;
  }>;
}

export class ValidationError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new ValidationError(msg);
}

export function validateDate(value: unknown): string {
  assert(typeof value === "string" && DATE_RE.test(value), `date must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  assert(
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d,
    `date is not a real calendar date: ${value}`
  );
  return value;
}

export function validateMonth(value: unknown): string {
  assert(typeof value === "string" && MONTH_RE.test(value), `month must be YYYY-MM, got ${JSON.stringify(value)}`);
  return value;
}

function validateAmountMinor(value: unknown, field: string): number {
  assert(
    typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value) && value > 0,
    `${field} must be a positive integer (minor units), got ${JSON.stringify(value)}`
  );
  return value;
}

function validateLimitMinor(value: unknown): number {
  assert(
    typeof value === "number" && Number.isInteger(value) && Number.isSafeInteger(value) && value >= 0,
    `limitMinor must be a non-negative integer (minor units), got ${JSON.stringify(value)}`
  );
  return value;
}

function validateNonEmptyString(value: unknown, field: string): string {
  assert(typeof value === "string" && value.trim().length > 0, `${field} must be a non-empty string`);
  return value.trim();
}

function validateCurrency(value: unknown): string {
  const v = validateNonEmptyString(value, "currency");
  assert(/^[A-Za-z]{3}$/.test(v), `currency must be a 3-letter code, got ${JSON.stringify(value)}`);
  return v.toUpperCase();
}

function validateIdempotencyKey(value: unknown): string {
  assert(
    typeof value === "string" && value.length > 0 && [...value].length <= 128 && value.trim() === value,
    "idempotencyKey must be a non-empty string of at most 128 characters without surrounding whitespace"
  );
  return value;
}

export function emptyLedger(): LedgerData {
  // Reading a missing file or using only legacy operations must not migrate it.
  return { version: LEGACY_LEDGER_VERSION, transactions: [], budgets: [] };
}

export function validateLedgerData(raw: unknown): LedgerData {
  assert(typeof raw === "object" && raw !== null, "ledger file must contain a JSON object");
  const data = raw as Record<string, unknown>;
  assert(data.version === LEGACY_LEDGER_VERSION || data.version === LEDGER_VERSION, `unsupported ledger version ${JSON.stringify(data.version)}`);
  assert(Array.isArray(data.transactions), "ledger.transactions must be an array");
  assert(Array.isArray(data.budgets), "ledger.budgets must be an array");
  const keys = new Set<string>();
  for (const t of data.transactions as unknown[]) {
    assert(typeof t === "object" && t !== null && !Array.isArray(t), "transaction must be an object");
    const tx = t as Record<string, unknown>;
    assert(typeof tx.id === "string" && tx.id.length > 0, "transaction.id must be a non-empty string");
    assert(tx.type === "income" || tx.type === "expense", "transaction.type must be income|expense");
    validateAmountMinor(tx.amountMinor, "transaction.amountMinor");
    validateCurrency(tx.currency);
    validateDate(tx.date);
    validateNonEmptyString(tx.category, "transaction.category");
    if (tx.note !== undefined) assert(typeof tx.note === "string", "transaction.note must be a string");
    if (tx.idempotencyKey !== undefined) {
      const key = validateIdempotencyKey(tx.idempotencyKey);
      assert(!keys.has(key), "duplicate transaction idempotencyKey in ledger");
      keys.add(key);
    }
  }
  const budgetScopes = new Map<string, { unassigned: boolean; currencies: Set<string> }>();
  for (const b of data.budgets as unknown[]) {
    assert(typeof b === "object" && b !== null && !Array.isArray(b), "budget must be an object");
    const bud = b as Record<string, unknown>;
    const category = validateNonEmptyString(bud.category, "budget.category");
    const month = validateMonth(bud.month);
    validateLimitMinor(bud.limitMinor);
    const key = JSON.stringify([category, month]);
    const scope = budgetScopes.get(key) ?? { unassigned: false, currencies: new Set<string>() };
    if (bud.currency === undefined) {
      assert(scope.currencies.size === 0, "unassigned and denominated budgets cannot share a category and month");
      scope.unassigned = true;
    } else {
      assert(data.version === LEDGER_VERSION, "denominated budgets require ledger version 2");
      const currency = validateCurrency(bud.currency);
      assert(!scope.unassigned, "unassigned and denominated budgets cannot share a category and month");
      assert(!scope.currencies.has(currency), "duplicate budget category, month and currency");
      scope.currencies.add(currency);
    }
    budgetScopes.set(key, scope);
  }
  return data as unknown as LedgerData;
}

export class LedgerStore {
  // All MCP servers in this process share a mutation queue for each resolved
  // data path. A snapshot save alone cannot protect a read-modify-write cycle.
  private static readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly filePath: string) {
    this.filePath = resolve(filePath);
  }

  /** Read, mutate and persist one operation before the next mutation reads. */
  async update<T>(mutate: (data: LedgerData) => T | Promise<T>): Promise<T> {
    const previous = LedgerStore.pending.get(this.filePath) ?? Promise.resolve();
    const operation = previous.then(async () => {
      const data = await this.load();
      const before = JSON.stringify(data);
      const result = await mutate(data);
      // An exact replay does not rewrite the original transaction or file.
      if (JSON.stringify(data) !== before) await this.save(data);
      return result;
    });
    const tail = operation.then(() => undefined, () => undefined);
    LedgerStore.pending.set(this.filePath, tail);
    try {
      return await operation;
    } finally {
      if (LedgerStore.pending.get(this.filePath) === tail) LedgerStore.pending.delete(this.filePath);
    }
  }

  async load(): Promise<LedgerData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return validateLedgerData(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
      throw err;
    }
  }

  /** Atomic snapshot replacement. Use update() for read-modify-write operations. */
  async save(data: LedgerData): Promise<void> {
    const validated = validateLedgerData(JSON.parse(JSON.stringify(data)));
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    const handle = await fs.open(tmp, "wx", 0o600);
    try {
      try {
        await handle.writeFile(JSON.stringify(validated, null, 2) + "\n", "utf8");
      } finally {
        await handle.close();
      }
      await fs.rename(tmp, this.filePath);
    } finally {
      await fs.rm(tmp, { force: true });
    }
  }
}

export function recordTransaction(data: LedgerData, input: RecordTransactionInput): Transaction {
  const tx: Transaction = {
    id: randomUUID(),
    type: input.type === "income" || input.type === "expense" ? input.type : (() => { throw new ValidationError(`type must be income|expense`); })(),
    amountMinor: validateAmountMinor(input.amountMinor, "amountMinor"),
    currency: validateCurrency(input.currency),
    date: validateDate(input.date),
    category: validateNonEmptyString(input.category, "category"),
    createdAt: new Date().toISOString(),
  };
  if (input.note !== undefined) {
    assert(typeof input.note === "string", "note must be a string");
    tx.note = input.note;
  }
  if (input.idempotencyKey !== undefined) {
    tx.idempotencyKey = validateIdempotencyKey(input.idempotencyKey);
    const existing = data.transactions.find(t => t.idempotencyKey === tx.idempotencyKey);
    if (existing) {
      assert(
        existing.type === tx.type && existing.amountMinor === tx.amountMinor &&
        existing.currency === tx.currency && existing.date === tx.date &&
        existing.category === tx.category && existing.note === tx.note,
        "idempotencyKey already records a different transaction; use its original input or a new key for a different recording"
      );
      return existing;
    }
  }
  data.transactions.push(tx);
  return tx;
}

export function listTransactions(data: LedgerData, filter: ListTransactionsFilter = {}): { total: number; transactions: Transaction[] } {
  const { type, category, from, to, order = "newest", limit = 50, offset = 0 } = filter;
  assert(limit === undefined || (Number.isInteger(limit) && limit >= 0 && limit <= 1000), "limit must be an integer 0..1000");
  assert(offset === undefined || (Number.isInteger(offset) && offset >= 0), "offset must be a non-negative integer");
  const fromD = from === undefined ? undefined : validateDate(from);
  const toD = to === undefined ? undefined : validateDate(to);
  assert(fromD === undefined || toD === undefined || fromD <= toD, "from must be on or before to");
  if (type !== undefined) assert(type === "income" || type === "expense", "type must be income|expense");
  assert(order === "newest" || order === "oldest", "order must be newest|oldest");
  const matched = data.transactions.filter(
    (t) =>
      (type === undefined || t.type === type) &&
      (category === undefined || t.category === category) &&
      (fromD === undefined || t.date >= fromD) &&
      (toD === undefined || t.date <= toD)
  );
  const direction = order === "oldest" ? -1 : 1;
  matched.sort((a, b) => (a.date < b.date ? direction : a.date > b.date ? -direction : 0));
  return { total: matched.length, transactions: matched.slice(offset, offset + limit) };
}

export function setBudget(data: LedgerData, category: string, month: string, limitMinor: number, currency?: string, replaceUnassigned = false): Budget {
  const cat = validateNonEmptyString(category, "category");
  const mon = validateMonth(month);
  const lim = validateLimitMinor(limitMinor);
  const denomination = currency === undefined ? undefined : validateCurrency(currency);
  assert(typeof replaceUnassigned === "boolean", "replaceUnassigned must be a boolean");
  assert(!replaceUnassigned || denomination !== undefined, "replaceUnassigned requires an explicit currency");
  const scope = data.budgets.filter((b) => b.category === cat && b.month === mon);
  const unassigned = scope.filter((b) => b.currency === undefined);
  let existing: Budget | undefined;
  if (denomination === undefined) {
    assert(scope.every((b) => b.currency === undefined), "currency is required to update a denominated category budget");
    existing = unassigned[0];
  } else if (unassigned.length > 0) {
    assert(replaceUnassigned, "budget has no assigned currency; supply replaceUnassigned: true with the intended currency and limit to replace it");
    assert(unassigned.length === 1, "multiple unassigned budgets match this category and month; cannot choose a budget to replace");
    existing = unassigned[0];
  } else {
    existing = scope.find((b) => b.currency !== undefined && validateCurrency(b.currency) === denomination);
  }
  if (existing) {
    existing.limitMinor = lim;
    if (denomination !== undefined) {
      existing.currency = denomination;
      data.version = LEDGER_VERSION;
    }
    return existing;
  }
  const budget: Budget = { category: cat, month: mon, limitMinor: lim };
  if (denomination !== undefined) {
    budget.currency = denomination;
    data.version = LEDGER_VERSION;
  }
  data.budgets.push(budget);
  return budget;
}

export function monthlySummary(data: LedgerData, year: number, month: number, currency?: string): MonthlySummary {
  assert(Number.isInteger(year) && year >= 1970 && year <= 9999, "year must be an integer 1970..9999");
  assert(Number.isInteger(month) && month >= 1 && month <= 12, "month must be an integer 1..12");
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const inMonth = data.transactions.filter((t) => t.date.startsWith(prefix));
  const monthBudgets = data.budgets.filter((b) => b.month === prefix);
  const requestedCurrency = currency === undefined ? undefined : validateCurrency(currency);
  const currencies = [...new Set(inMonth.map((t) => validateCurrency(t.currency)))].sort();
  const availableCurrencies = [...new Set([
    ...currencies,
    ...monthBudgets.flatMap((b) => b.currency === undefined ? [] : [validateCurrency(b.currency)]),
  ])].sort();
  assert(
    requestedCurrency !== undefined || availableCurrencies.length <= 1,
    `month contains multiple currencies (${availableCurrencies.join(", ")}); supply currency to select transaction totals and budgets`
  );
  const summaryCurrency = requestedCurrency ?? (availableCurrencies.length === 1 ? availableCurrencies[0] : null);
  // Unassigned budgets retain their legacy one-transaction-currency context.
  // A partial migration must not silently omit an unresolved budget or infer
  // its denomination from newly assigned budgets.
  assert(
    monthBudgets.every((b) => b.currency !== undefined) || (currencies.length === 1 && summaryCurrency === currencies[0]),
    "monthly category budgets have no currency; cannot evaluate them for a mixed-currency, empty, or differently selected month; use set_budget with currency and replaceUnassigned: true to explicitly assign each unqualified budget"
  );
  const selected = inMonth.filter((t) => validateCurrency(t.currency) === summaryCurrency);
  const byCategory: MonthlySummary["byCategory"] = Object.create(null);
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const t of selected) {
    const entry = (byCategory[t.category] ??= { incomeMinor: 0, expenseMinor: 0 });
    if (t.type === "income") {
      incomeMinor += t.amountMinor;
      entry.incomeMinor += t.amountMinor;
    } else {
      expenseMinor += t.amountMinor;
      entry.expenseMinor += t.amountMinor;
    }
  }
  // Refuse inexact gross totals even when income and expense would nearly
  // cancel in the net figure.
  assert(
    Number.isSafeInteger(incomeMinor) && Number.isSafeInteger(expenseMinor),
    "monthly transaction totals exceed the safe integer range"
  );
  const budgets = monthBudgets
    .filter((b) => b.currency === undefined || validateCurrency(b.currency) === summaryCurrency)
    .map((b) => {
      const spentMinor = byCategory[b.category]?.expenseMinor ?? 0;
      return {
        category: b.category,
        ...(b.currency === undefined ? {} : { currency: validateCurrency(b.currency) }),
        limitMinor: b.limitMinor,
        spentMinor,
        remainingMinor: b.limitMinor - spentMinor,
        over: spentMinor > b.limitMinor,
      };
    });
  return { year, month, currency: summaryCurrency, incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor, byCategory, budgets };
}

export function getBudgets(data: LedgerData, month: string, currency?: string): Budget[] {
  const mon = validateMonth(month);
  const denomination = currency === undefined ? undefined : validateCurrency(currency);
  return data.budgets.filter((b) => b.month === mon &&
    (denomination === undefined || (b.currency !== undefined && validateCurrency(b.currency) === denomination)));
}
