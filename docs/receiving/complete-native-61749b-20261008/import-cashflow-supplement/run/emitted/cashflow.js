/**
 * Read-only calendar-month cashflow, composed from the existing monthly summary.
 * No opening balance, currency conversion, persistence or budget assignment.
 */
import { monthlySummary, validateMonth, ValidationError } from "./ledger.js";
export const MAX_CASHFLOW_MONTHS = 120;
function monthIndex(value, field) {
    let month;
    try {
        month = validateMonth(value);
    }
    catch (error) {
        if (error instanceof ValidationError)
            throw new ValidationError(field + ": " + error.message);
        throw error;
    }
    const [year, number] = month.split("-").map(Number);
    if (year < 1970 || year > 9999)
        throw new ValidationError(field + " year must be 1970..9999");
    return year * 12 + number - 1;
}
function monthLabel(index) {
    return String(Math.floor(index / 12)).padStart(4, "0") + "-" + String(index % 12 + 1).padStart(2, "0");
}
function checkedAdd(left, right, field) {
    const total = left + right;
    if (!Number.isSafeInteger(total))
        throw new ValidationError("cashflow " + field + " exceeds the safe integer range");
    return total;
}
export function cashflowTrend(data, input) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
        throw new ValidationError("cashflow input must contain fromMonth and toMonth");
    }
    const first = monthIndex(input.fromMonth, "fromMonth");
    const last = monthIndex(input.toMonth, "toMonth");
    if (last < first)
        throw new ValidationError("toMonth must be on or after fromMonth");
    const monthCount = last - first + 1;
    if (monthCount > MAX_CASHFLOW_MONTHS)
        throw new ValidationError("cashflow interval must contain 1..120 months");
    // Delegate currency normalization, per-month arithmetic and legacy-budget
    // admission. All calls see the same ledger snapshot supplied by the handler.
    const summaries = [];
    for (let index = first; index <= last; index++) {
        const month = monthLabel(index);
        try {
            summaries.push({
                month,
                value: monthlySummary(data, Math.floor(index / 12), index % 12 + 1, input.currency),
            });
        }
        catch (error) {
            if (error instanceof ValidationError)
                throw new ValidationError(month + ": " + error.message);
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
    const months = summaries.map(({ month, value }) => {
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
