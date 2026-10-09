import { types } from "node:util";
import { emptyLedger, recordTransaction, validateDate, validateMonth, ValidationError } from "./ledger.js";
import { MAX_EXPENSES, MAX_PLAN_BYTES, previewExpensePlan } from "./expense-plan.js";

export const MAX_RULES = 100;
export const MAX_RULE_BYTES = 1024 * 1024;
export interface GeneratedExpense {
  readonly date: string; readonly category: string; readonly amountMinor: number; readonly note?: string;
}
export interface RecurringExpensePlan {
  readonly month: string; readonly currency: string;
  readonly plan: { readonly schema: "household-expense-plan/1"; readonly expenses: readonly GeneratedExpense[] };
  readonly occurrences: readonly { readonly position: number; readonly ruleId: string; readonly rulePosition: number; readonly date: string }[];
  readonly skipped: readonly { readonly ruleId: string; readonly rulePosition: number; readonly month: string; readonly requestedDay: number; readonly reason: "missing-day" }[];
}
interface Rule {
  id: string; position: number; start: string; end?: string; category: string; amountMinor: number; note?: string;
  repeat: { unit: "week" | "month"; every: number; missingDay?: "skip" | "last" };
}
function requireValue(value: unknown, message: string): asserts value {
  if (!value) throw new ValidationError(message);
}
function object(value: unknown, allowed: string[], required: string[], label: string): Record<string, unknown> {
  requireValue(!types.isProxy(value), label + " cannot be a Proxy");
  requireValue(typeof value === "object" && value !== null && !Array.isArray(value), label + " must be an object");
  const prototype = Object.getPrototypeOf(value);
  requireValue(prototype === Object.prototype || prototype === null, label + " must be a plain object");
  for (const key of Reflect.ownKeys(value)) {
    requireValue(typeof key === "string" && allowed.includes(key), label + " contains unsupported fields");
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    requireValue(descriptor.enumerable && Object.hasOwn(descriptor, "value"), label + " must contain JSON data fields");
  }
  requireValue(required.every(key => Object.hasOwn(value, key)), label + " is missing required fields");
  return value as Record<string, unknown>;
}
function jsonRules(value: unknown): unknown[] {
  requireValue(!types.isProxy(value), "rules cannot be a Proxy");
  requireValue(Array.isArray(value) && value.length <= MAX_RULES, "rules must contain 0..100 entries");
  requireValue(Object.getPrototypeOf(value) === Array.prototype, "rules must be a plain JSON array");
  requireValue(Reflect.ownKeys(value).length === value.length + 1, "rules cannot contain holes or extra fields");
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    requireValue(descriptor !== undefined && descriptor.enumerable && Object.hasOwn(descriptor, "value"),
      "rules must contain dense JSON data entries");
  }
  return value;
}
function date(value: unknown): string {
  requireValue(typeof value === "string", "date must be a YYYY-MM-DD string");
  const result = validateDate(value);
  requireValue(Number(result.slice(0, 4)) >= 1970, "dates must be in years 1970..9999");
  return result;
}
function identifier(value: unknown): string {
  requireValue(typeof value === "string", "rule id must be text");
  requireValue(value === value.trim() && [...value].length >= 1 && [...value].length <= 128 &&
    !/[\u0000-\u001f\u007f]/u.test(value), "rule id must be 1..128 unpadded noncontrol code points");
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      requireValue(next >= 0xdc00 && next <= 0xdfff, "rule id must be well-formed Unicode");
    } else requireValue(!(code >= 0xdc00 && code <= 0xdfff), "rule id must be well-formed Unicode");
  }
  return value;
}
function period(value: unknown, maximum: number): number {
  requireValue(typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maximum,
    "repeat.every must be an integer in 1.." + maximum);
  return value;
}
function monthDays(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function dayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
}
function immutable<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
}

// This produces a detached plan only. Native validation uses ephemeral ledgers;
// neither those ledgers nor their generated transaction IDs/timestamps escape.
export function generateRecurringExpensePlan(input: unknown, selectedMonth: unknown): RecurringExpensePlan {
  requireValue(typeof selectedMonth === "string", "month must be a YYYY-MM string");
  const month = validateMonth(selectedMonth);
  const [year, monthNumber] = month.split("-").map(Number);
  requireValue(year >= 1970 && year <= 9999, "month must be in 1970-01..9999-12");
  const source = object(input, ["schema", "currency", "rules"], ["schema", "currency", "rules"], "rules document");
  requireValue(source.schema === "household-recurring-expenses/1", "unsupported recurring expense schema");
  const rawRules = jsonRules(source.rules);
  const currency = previewExpensePlan(emptyLedger(),
    { schema: "household-expense-plan/1", expenses: [] }, month, source.currency).currency;
  const ids = new Set<string>();
  const rules: Rule[] = rawRules.map((raw, index) => {
    const item = object(raw, ["id", "start", "end", "category", "amountMinor", "note", "repeat"],
      ["id", "start", "category", "amountMinor", "repeat"], "rule " + (index + 1));
    const id = identifier(item.id);
    requireValue(!ids.has(id), "duplicate rule id: " + id); ids.add(id);
    const start = date(item.start);
    const end = Object.hasOwn(item, "end") ? date(item.end) : undefined;
    requireValue(end === undefined || end >= start, "rule end must be on or after start");
    if (Object.hasOwn(item, "note")) requireValue(typeof item.note === "string", "note must be a string");
    const repeat = object(item.repeat, ["unit", "every", "missingDay"], ["unit", "every"], "repeat");
    requireValue(repeat.unit === "week" || repeat.unit === "month", "repeat.unit must be week or month");
    if (repeat.unit === "week") requireValue(!Object.hasOwn(repeat, "missingDay"), "weekly repeat cannot specify missingDay");
    else requireValue(repeat.missingDay === "skip" || repeat.missingDay === "last", "monthly missingDay must be skip or last");
    const every = period(repeat.every, repeat.unit === "week" ? 52 : 120);
    requireValue(typeof item.amountMinor === "number", "amountMinor must be a number");
    const native = recordTransaction(emptyLedger(), {
      type: "expense", date: start, currency, category: item.category as string,
      amountMinor: item.amountMinor as number,
      ...(Object.hasOwn(item, "note") ? { note: item.note as string } : {}),
    });
    return {
      id, position: index + 1, start, ...(end === undefined ? {} : { end }),
      category: native.category, amountMinor: native.amountMinor,
      ...(native.note === undefined ? {} : { note: native.note }),
      repeat: { unit: repeat.unit, every, ...(repeat.unit === "month" ? { missingDay: repeat.missingDay as "skip" | "last" } : {}) },
    };
  });
  let canonical: string;
  try { canonical = JSON.stringify(input); }
  catch { throw new ValidationError("rules must be JSON data"); }
  requireValue(Buffer.byteLength(canonical, "utf8") <= MAX_RULE_BYTES, "rules exceed the 1 MiB API JSON limit");

  const days = monthDays(year, monthNumber);
  const scheduled: { rule: Rule; date: string }[] = [];
  const skipped: { ruleId: string; rulePosition: number; month: string; requestedDay: number; reason: "missing-day" }[] = [];
  const inRange = (rule: Rule, value: string) => value >= rule.start && (rule.end === undefined || value <= rule.end);
  const dateInMonth = (day: number) => month + "-" + String(day).padStart(2, "0");
  const add = (rule: Rule, value: string) => {
    scheduled.push({ rule, date: value });
    requireValue(scheduled.length <= MAX_EXPENSES, "generated plan exceeds 500 occurrences");
  };
  for (const rule of rules) {
    if (rule.repeat.unit === "week") {
      const anchor = dayNumber(rule.start);
      for (let day = 1; day <= days; day++) {
        const value = dateInMonth(day);
        if (inRange(rule, value) && (dayNumber(value) - anchor) % (7 * rule.repeat.every) === 0) add(rule, value);
      }
    } else {
      const [startYear, startMonth, requestedDay] = rule.start.split("-").map(Number);
      const elapsed = (year - startYear) * 12 + monthNumber - startMonth;
      if (elapsed < 0 || elapsed % rule.repeat.every !== 0) continue;
      const value = dateInMonth(Math.min(requestedDay, days));
      if (!inRange(rule, value)) continue;
      if (requestedDay > days && rule.repeat.missingDay === "skip") {
        skipped.push({ ruleId: rule.id, rulePosition: rule.position, month, requestedDay, reason: "missing-day" });
      } else add(rule, value);
    }
  }
  scheduled.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.rule.position - b.rule.position);
  const plan = {
    schema: "household-expense-plan/1" as const,
    expenses: scheduled.map(({ rule, date }) => ({
      date, category: rule.category, amountMinor: rule.amountMinor,
      ...(rule.note === undefined ? {} : { note: rule.note }),
    })),
  };
  // Native aggregate arithmetic, currency admission and strict plan schema remain authoritative.
  previewExpensePlan(emptyLedger(), plan, month, currency);
  requireValue(Buffer.byteLength(JSON.stringify(plan, null, 2) + "\n", "utf8") <= MAX_PLAN_BYTES,
    "complete generated plan exceeds 1 MiB");
  const occurrences = scheduled.map(({ rule, date }, index) => ({
    position: index + 1, ruleId: rule.id, rulePosition: rule.position, date,
  }));
  return immutable({ month, currency, plan, occurrences, skipped });
}
