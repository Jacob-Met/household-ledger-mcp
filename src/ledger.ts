/**
 * Core ledger domain logic: transactions, monthly summaries, category budgets,
 * and atomic JSON persistence. Pure of any transport concerns.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";

export const LEDGER_VERSION = 1;

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
  createdAt: string;
}

export interface Budget {
  /** Category this budget applies to. */
  category: string;
  /** YYYY-MM */
  month: string;
  /** Integer minor units, >= 0. */
  limitMinor: number;
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
}

export interface ListTransactionsFilter {
  type?: TransactionType;
  category?: string;
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
  limit?: number;
  offset?: number;
}

export interface MonthlySummary {
  year: number;
  month: number;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  byCategory: Record<string, { incomeMinor: number; expenseMinor: number }>;
  budgets: Array<{
    category: string;
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

export function emptyLedger(): LedgerData {
  return { version: LEDGER_VERSION, transactions: [], budgets: [] };
}

export function validateLedgerData(raw: unknown): LedgerData {
  assert(typeof raw === "object" && raw !== null, "ledger file must contain a JSON object");
  const data = raw as Record<string, unknown>;
  assert(data.version === LEDGER_VERSION, `unsupported ledger version ${JSON.stringify(data.version)}`);
  assert(Array.isArray(data.transactions), "ledger.transactions must be an array");
  assert(Array.isArray(data.budgets), "ledger.budgets must be an array");
  for (const t of data.transactions as unknown[]) {
    const tx = t as Record<string, unknown>;
    assert(typeof tx.id === "string" && tx.id.length > 0, "transaction.id must be a non-empty string");
    assert(tx.type === "income" || tx.type === "expense", "transaction.type must be income|expense");
    validateAmountMinor(tx.amountMinor, "transaction.amountMinor");
    validateCurrency(tx.currency);
    validateDate(tx.date);
    validateNonEmptyString(tx.category, "transaction.category");
  }
  for (const b of data.budgets as unknown[]) {
    const bud = b as Record<string, unknown>;
    validateNonEmptyString(bud.category, "budget.category");
    validateMonth(bud.month);
    validateLimitMinor(bud.limitMinor);
  }
  return data as unknown as LedgerData;
}

export class LedgerStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<LedgerData> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return validateLedgerData(JSON.parse(raw));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger();
      throw err;
    }
  }

  /** Atomic persist: write temp file in the same directory, then rename. */
  async save(data: LedgerData): Promise<void> {
    const validated = validateLedgerData(JSON.parse(JSON.stringify(data)));
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(validated, null, 2) + "\n", "utf8");
    await fs.rename(tmp, this.filePath);
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
  data.transactions.push(tx);
  return tx;
}

export function listTransactions(data: LedgerData, filter: ListTransactionsFilter = {}): { total: number; transactions: Transaction[] } {
  const { type, category, from, to, limit = 50, offset = 0 } = filter;
  assert(limit === undefined || (Number.isInteger(limit) && limit >= 0 && limit <= 1000), "limit must be an integer 0..1000");
  assert(offset === undefined || (Number.isInteger(offset) && offset >= 0), "offset must be a non-negative integer");
  const fromD = from === undefined ? undefined : validateDate(from);
  const toD = to === undefined ? undefined : validateDate(to);
  if (type !== undefined) assert(type === "income" || type === "expense", "type must be income|expense");
  const matched = data.transactions.filter(
    (t) =>
      (type === undefined || t.type === type) &&
      (category === undefined || t.category === category) &&
      (fromD === undefined || t.date >= fromD) &&
      (toD === undefined || t.date <= toD)
  );
  matched.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { total: matched.length, transactions: matched.slice(offset, offset + limit) };
}

export function setBudget(data: LedgerData, category: string, month: string, limitMinor: number): Budget {
  const cat = validateNonEmptyString(category, "category");
  const mon = validateMonth(month);
  const lim = validateLimitMinor(limitMinor);
  const existing = data.budgets.find((b) => b.category === cat && b.month === mon);
  if (existing) {
    existing.limitMinor = lim;
    return existing;
  }
  const budget: Budget = { category: cat, month: mon, limitMinor: lim };
  data.budgets.push(budget);
  return budget;
}

export function monthlySummary(data: LedgerData, year: number, month: number): MonthlySummary {
  assert(Number.isInteger(year) && year >= 1970 && year <= 9999, "year must be an integer 1970..9999");
  assert(Number.isInteger(month) && month >= 1 && month <= 12, "month must be an integer 1..12");
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const inMonth = data.transactions.filter((t) => t.date.startsWith(prefix));
  const byCategory: MonthlySummary["byCategory"] = {};
  let incomeMinor = 0;
  let expenseMinor = 0;
  for (const t of inMonth) {
    const entry = (byCategory[t.category] ??= { incomeMinor: 0, expenseMinor: 0 });
    if (t.type === "income") {
      incomeMinor += t.amountMinor;
      entry.incomeMinor += t.amountMinor;
    } else {
      expenseMinor += t.amountMinor;
      entry.expenseMinor += t.amountMinor;
    }
  }
  const budgets = data.budgets
    .filter((b) => b.month === prefix)
    .map((b) => {
      const spentMinor = byCategory[b.category]?.expenseMinor ?? 0;
      return {
        category: b.category,
        limitMinor: b.limitMinor,
        spentMinor,
        remainingMinor: b.limitMinor - spentMinor,
        over: spentMinor > b.limitMinor,
      };
    });
  return { year, month, incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor, byCategory, budgets };
}

export function getBudgets(data: LedgerData, month: string): Budget[] {
  const mon = validateMonth(month);
  return data.budgets.filter((b) => b.month === mon);
}
