/** Browser-safe editor for the released household-recurring-expenses/1 input.
 * No recurrence expansion, ledger access, network or storage.
 */
export const MAX_BYTES = 1024 * 1024;
export const MAX_RULES = 100;
const utf8 = new TextEncoder();
const fail = message => { throw new Error(message); };
function check(value, message) { if (!value) fail(message); }
function record(value, allowed, required, label) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value), label + ' must be an object.');
  const prototype = Object.getPrototypeOf(value);
  check(prototype === Object.prototype || prototype === null, label + ' must be a plain JSON object.');
  const copy = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    check(typeof key === 'string' && allowed.includes(key), label + ' has an unsupported field.');
    const d = Object.getOwnPropertyDescriptor(value, key);
    check(d.enumerable && Object.hasOwn(d, 'value'), label + ' must contain ordinary JSON values.');
    copy[key] = d.value;
  }
  check(required.every(key => Object.hasOwn(copy, key)), label + ' is missing a required field.');
  return copy;
}
function rulesArray(value) {
  check(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, 'Rules must be a plain array.');
  check(value.length <= MAX_RULES, 'At most 100 rules can be saved.');
  check(Reflect.ownKeys(value).length === value.length + 1, 'Rules cannot contain holes or extra fields.');
  const copy = [];
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    check(d && d.enumerable && Object.hasOwn(d, 'value'), 'Rules must contain ordinary dense values.');
    copy.push(d.value);
  }
  return copy;
}
function realDate(value, label) {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), label + ' must be YYYY-MM-DD.');
  const [year, month, day] = value.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  check(year >= 1970 && year <= 9999 && d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 && d.getUTCDate() === day, label + ' must be a real date in 1970–9999.');
  return value;
}
function identifier(value) {
  check(typeof value === 'string' && value === value.trim() && [...value].length >= 1 &&
    [...value].length <= 128 && !/[\u0000-\u001f\u007f]/u.test(value), 'Rule ID needs 1–128 unpadded, noncontrol characters.');
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = value.charCodeAt(++i);
      check(n >= 0xdc00 && n <= 0xdfff, 'Rule ID must be well-formed Unicode.');
    } else check(!(c >= 0xdc00 && c <= 0xdfff), 'Rule ID must be well-formed Unicode.');
  }
  return value;
}
function positive(value, max, label) {
  check(typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= max,
    label + ' must be an integer from 1 through ' + max + '.');
  return value;
}
function canonicalRule(raw, position) {
  const r = record(raw, ['id','start','end','category','amountMinor','note','repeat'],
    ['id','start','category','amountMinor','repeat'], 'Rule ' + position);
  const id = identifier(r.id), start = realDate(r.start, 'Start date');
  const result = { id, start };
  if (Object.hasOwn(r, 'end')) {
    result.end = realDate(r.end, 'End date');
    check(result.end >= start, 'End date must be on or after start.');
  }
  check(typeof r.category === 'string' && r.category.trim().length > 0, 'Category cannot be blank.');
  result.category = r.category;
  result.amountMinor = positive(r.amountMinor, Number.MAX_SAFE_INTEGER, 'Amount in minor units');
  if (Object.hasOwn(r, 'note')) {
    check(typeof r.note === 'string', 'A present note must be text.');
    result.note = r.note;
  }
  const p = record(r.repeat, ['unit','every','missingDay'], ['unit','every'], 'Repeat');
  check(p.unit === 'week' || p.unit === 'month', 'Choose weekly or monthly repetition.');
  result.repeat = { unit:p.unit, every:positive(p.every, p.unit === 'week' ? 52 : 120, 'Repeat interval') };
  if (p.unit === 'week') check(!Object.hasOwn(p, 'missingDay'), 'A weekly rule cannot contain a missing-day choice.');
  else {
    check(p.missingDay === 'skip' || p.missingDay === 'last', 'Monthly rules require an explicit skip or last-day choice.');
    result.repeat.missingDay = p.missingDay;
  }
  return result;
}
export function validateDocument(raw) {
  const doc = record(raw, ['schema','currency','rules'], ['schema','currency','rules'], 'Rule document');
  check(doc.schema === 'household-recurring-expenses/1', 'Unsupported rule document schema.');
  check(typeof doc.currency === 'string' && /^[A-Za-z]{3}$/.test(doc.currency.trim()), 'Currency must contain three ASCII letters.');
  const ids = new Set();
  const rules = rulesArray(doc.rules).map((r, index) => {
    const value = canonicalRule(r, index + 1);
    check(!ids.has(value.id), 'Rule IDs must be unique: ' + JSON.stringify(value.id));
    ids.add(value.id); return value;
  });
  const result = { schema:'household-recurring-expenses/1', currency:doc.currency, rules };
  check(utf8.encode(JSON.stringify(result, null, 2) + '\n').byteLength <= MAX_BYTES, 'Complete saved rules exceed 1 MiB.');
  return result;
}
/** Strict JSON parser: duplicate decoded keys refuse before any last-key wins. */
function strictJSON(text) {
  let at = 0, nodes = 0;
  const ws = () => { while (at < text.length && /[ \t\r\n]/.test(text[at])) at++; };
  function string() {
    const start = at++;
    let escaped = false;
    while (at < text.length) {
      const c = text[at++];
      if (!escaped && c === '"') {
        try { return JSON.parse(text.slice(start, at)); } catch { fail('Invalid JSON string.'); }
      }
      if (!escaped && c === '\\') escaped = true; else escaped = false;
    }
    fail('Unterminated JSON string.');
  }
  function value(depth) {
    check(depth <= 8 && ++nodes <= 4096, 'JSON exceeds the editor depth or value bound.');
    ws(); const c = text[at];
    if (c === '"') return string();
    if (c === '{') {
      at++; ws(); const result = Object.create(null), keys = new Set();
      if (text[at] === '}') { at++; return result; }
      while (true) {
        ws(); check(text[at] === '"', 'Expected a JSON object key.');
        const key = string(); check(!keys.has(key), 'Duplicate JSON member: ' + JSON.stringify(key)); keys.add(key);
        ws(); check(text[at++] === ':', 'Expected a colon.'); result[key] = value(depth + 1);
        ws(); const separator = text[at++];
        if (separator === '}') return result;
        check(separator === ',', 'Expected an object separator.');
      }
    }
    if (c === '[') {
      at++; ws(); const result = [];
      if (text[at] === ']') { at++; return result; }
      while (true) {
        result.push(value(depth + 1)); ws(); const separator = text[at++];
        if (separator === ']') return result;
        check(separator === ',', 'Expected an array separator.');
      }
    }
    for (const [token, primitive] of [['true',true],['false',false],['null',null]]) {
      if (text.startsWith(token, at)) { at += token.length; return primitive; }
    }
    const number = text.slice(at).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    check(number, 'Invalid JSON value.'); at += number[0].length;
    const result = Number(number[0]); check(Number.isFinite(result), 'JSON numbers must be finite.'); return result;
  }
  const result = value(0); ws(); check(at === text.length, 'Unexpected trailing JSON content.'); return result;
}
export function decodeRules(bytes) {
  check(bytes instanceof Uint8Array, 'Open requires UTF-8 file bytes.');
  check(bytes.byteLength <= MAX_BYTES, 'Rule file exceeds 1 MiB.');
  let text;
  try { text = new TextDecoder('utf-8', { fatal:true, ignoreBOM:true }).decode(bytes.slice()); }
  catch { fail('Rule file is not valid UTF-8.'); }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return validateDocument(strictJSON(text));
}
export function encodeRules(document) {
  return utf8.encode(JSON.stringify(validateDocument(document), null, 2) + '\n');
}
function ordinal(index, length) {
  check(typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 && index < length,
    'Select an existing rule position.');
  return index;
}
export function replaceRule(document, index, rule) {
  const next = validateDocument(document);
  if (index === null) next.rules.push(rule);
  else next.rules[ordinal(index, next.rules.length)] = rule;
  return validateDocument(next);
}
export function removeRule(document, index) {
  const next = validateDocument(document);
  next.rules.splice(ordinal(index, next.rules.length), 1); return validateDocument(next);
}
export function moveRule(document, index, delta) {
  const next = validateDocument(document), from = ordinal(index, next.rules.length);
  check(delta === -1 || delta === 1, 'Move must be one position earlier or later.');
  const to = ordinal(from + delta, next.rules.length);
  [next.rules[from], next.rules[to]] = [next.rules[to], next.rules[from]];
  return validateDocument(next);
}
export function parsePositiveInteger(text, maximum, label = 'Value') {
  check(typeof text === 'string' && /^[1-9]\d*$/.test(text), label + ' needs whole positive digits.');
  return positive(Number(text), maximum, label);
}
