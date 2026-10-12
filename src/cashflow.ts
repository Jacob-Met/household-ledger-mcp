/**
 * Read-only calendar-month cashflow, composed from the existing monthly summary.
 * No opening balance, currency conversion, persistence or budget assignment.
 */
import { monthlySummary, validateMonth, ValidationError, type LedgerData, type MonthlySummary } from "./ledger.js";

export const MAX_CASHFLOW_MONTHS = 120;

export interface CashflowTrendInput {
  /** Inclusive YYYY-MM, within the monthly-summary year range. */
  fromMonth: string;
  /** Inclusive YYYY-MM. At most 120 calendar months including both endpoints. */
  toMonth: string;
  currency?: string;
}

export interface CashflowMonth {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  /** Net transactions since fromMonth, starting from zero; not an account balance. */
  cumulativeNetMinor: number;
  byCategory: MonthlySummary["byCategory"];
  budgets: MonthlySummary["budgets"];
}

export interface CashflowTrend {
  fromMonth: string;
  toMonth: string;
  monthCount: number;
  /** One denomination for the entire interval; null only for an unselected empty interval. */
  currency: string | null;
  totals: { incomeMinor: number; expenseMinor: number; netMinor: number };
  months: CashflowMonth[];
}

function monthIndex(value: unknown, field: string): number {
  let month: string;
  try {
    month = validateMonth(value);
  } catch (error) {
    if (error instanceof ValidationError) throw new ValidationError(field + ": " + error.message);
    throw error;
  }
  const [year, number] = month.split("-").map(Number);
  if (year < 1970 || year > 9999) throw new ValidationError(field + " year must be 1970..9999");
  return year * 12 + number - 1;
}

function monthLabel(index: number): string {
  return String(Math.floor(index / 12)).padStart(4, "0") + "-" + String(index % 12 + 1).padStart(2, "0");
}

function checkedAdd(left: number, right: number, field: string): number {
  const total = left + right;
  if (!Number.isSafeInteger(total)) throw new ValidationError("cashflow " + field + " exceeds the safe integer range");
  return total;
}

export function cashflowTrend(data: LedgerData, input: CashflowTrendInput): CashflowTrend {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ValidationError("cashflow input must contain fromMonth and toMonth");
  }
  const first = monthIndex(input.fromMonth, "fromMonth");
  const last = monthIndex(input.toMonth, "toMonth");
  if (last < first) throw new ValidationError("toMonth must be on or after fromMonth");
  const monthCount = last - first + 1;
  if (monthCount > MAX_CASHFLOW_MONTHS) throw new ValidationError("cashflow interval must contain 1..120 months");

  // Partition the same saved snapshot once for multi-month requests. Each
  // summary still owns its currency, budget and arithmetic rules, without
  // rescanning every transaction and budget for every requested month.
  const monthlyData = new Map<string, LedgerData>();
  if (monthCount > 1) {
    for (let index = first; index <= last; index++) {
      monthlyData.set(monthLabel(index), { version: data.version, transactions: [], budgets: [] });
    }
    for (const transaction of data.transactions) {
      monthlyData.get(transaction.date.slice(0, 7))?.transactions.push(transaction);
    }
    for (const budget of data.budgets) {
      monthlyData.get(budget.month)?.budgets.push(budget);
    }
  }

  // Delegate currency normalization, per-month arithmetic and legacy-budget
  // admission. The partitions preserve original row order and object identity;
  // a single-month request keeps the original path without partition overhead.
  const summaries: Array<{ month: string; value: MonthlySummary }> = [];
  for (let index = first; index <= last; index++) {
    const month = monthLabel(index);
    try {
      summaries.push({
        month,
        value: monthlySummary(monthlyData.get(month) ?? data, Math.floor(index / 12), index % 12 + 1, input.currency),
      });
    } catch (error) {
      if (error instanceof ValidationError) throw new ValidationError(month + ": " + error.message);
      throw error;
    }
  }

  // Individually single-currency months can still disagree with each other.
  // Resolve the interval denomination before any cross-month accumulation.
  const currencies = [...new Set(summaries.flatMap(({ value }) => value.currency === null ? [] : [value.currency]))].sort();
  if (currencies.length > 1) {
    throw new ValidationError("cashflow interval contains multiple currencies (" + currencies.join(", ") + "); supply currency to select the whole interval");
  }
  const currency = currencies[0] ?? null;
  let incomeMinor = 0;
  let expenseMinor = 0;
  let cumulativeNetMinor = 0;
  const months = summaries.map(({ month, value }): CashflowMonth => {
    // Safe net cancellation does not excuse unsafe gross totals.
    incomeMinor = checkedAdd(incomeMinor, value.incomeMinor, "period income");
    expenseMinor = checkedAdd(expenseMinor, value.expenseMinor, "period expense");
    cumulativeNetMinor = checkedAdd(cumulativeNetMinor, value.netMinor, "cumulative period net");
    return {
      month,
      incomeMinor: value.incomeMinor,
      expenseMinor: value.expenseMinor,
      netMinor: value.netMinor,
      cumulativeNetMinor,
      byCategory: value.byCategory,
      budgets: value.budgets,
    };
  });
  return {
    fromMonth: monthLabel(first),
    toMonth: monthLabel(last),
    monthCount,
    currency,
    totals: { incomeMinor, expenseMinor, netMinor: checkedAdd(incomeMinor, -expenseMinor, "period net") },
    months,
  };
}
