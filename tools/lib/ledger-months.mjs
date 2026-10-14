import { validateLedgerData } from '../../dist/src/ledger.js';

export const MAX_LEDGER_ROWS = 100_000;
export const NOTICE = 'Recorded month keys from this saved ledger only. Counts describe saved row occurrences, not unique purchases or account completeness. Currency groups do not convert or total amounts. Legacy unassigned budgets retain no currency. Discovery does not imply that an existing monthly summary will accept the selected ledger and currency.';

/** Project a complete native-admitted JSON ledger without modifying it. */
export function summarizeMonths(raw) {
  const data = validateLedgerData(raw);
  if (data.transactions.length + data.budgets.length > MAX_LEDGER_ROWS) {
    throw new Error(`ledger exceeds ${MAX_LEDGER_ROWS} combined transaction and budget rows`);
  }

  const months = new Map();
  function monthRow(month) {
    if (!months.has(month)) {
      const year = Number(month.slice(0, 4));
      months.set(month, {
        month,
        summary_supported: year >= 1970 && year <= 9999,
        transaction_count: 0,
        budget_count: 0,
        unassigned_budget_count: 0,
        currencies: new Map(),
      });
    }
    return months.get(month);
  }
  function currencyRow(row, rawCurrency) {
    // The native validator has already admitted exactly three ASCII letters.
    const currency = rawCurrency.trim().toUpperCase();
    if (!row.currencies.has(currency)) {
      row.currencies.set(currency, {
        currency,
        transaction_count: 0,
        income_count: 0,
        expense_count: 0,
        budget_count: 0,
      });
    }
    return row.currencies.get(currency);
  }

  for (const tx of data.transactions) {
    const row = monthRow(tx.date.slice(0, 7));
    const group = currencyRow(row, tx.currency);
    row.transaction_count++;
    group.transaction_count++;
    if (tx.type === 'income') group.income_count++;
    else group.expense_count++;
  }
  for (const budget of data.budgets) {
    const row = monthRow(budget.month);
    row.budget_count++;
    if (budget.currency === undefined) row.unassigned_budget_count++;
    else currencyRow(row, budget.currency).budget_count++;
  }

  const rows = [...months.keys()].sort().map(month => {
    const row = months.get(month);
    return {
      ...row,
      currencies: [...row.currencies.keys()].sort().map(currency => row.currencies.get(currency)),
    };
  });
  return {
    counts: { transactions: data.transactions.length, budgets: data.budgets.length, months: rows.length },
    months: rows,
  };
}
