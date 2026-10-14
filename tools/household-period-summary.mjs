#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ValidationError } from '../src/ledger.ts';
import { readPeriodSummary, formatPeriodText, boundedOutput } from './lib/period-summary.mjs';

const HELP = `Usage: node --experimental-transform-types tools/household-period-summary.mjs --ledger FILE --from YYYY-MM-DD --to YYYY-MM-DD --currency CODE [--json]

Review complete recorded cash flow for an explicit inclusive date range.
All amounts are integer minor units in one explicit currency. This is not an
account balance; monthly budgets are not allocated to the selected period.
The ledger is read-only. Output goes to stdout; --json retains the complete
summary and captured file identity. --help alone reads no file.
`;

function parse(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  const allowed = new Set(['--ledger', '--from', '--to', '--currency']);
  const found = new Map();
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--json') {
      if (json) throw new ValidationError('--json may occur only once');
      json = true;
      continue;
    }
    if (!allowed.has(key)) throw new ValidationError('unknown argument ' + JSON.stringify(key));
    if (found.has(key)) throw new ValidationError(key + ' may occur only once');
    const value = argv[++i];
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      throw new ValidationError(key + ' requires one nonempty value');
    }
    found.set(key, value);
  }
  for (const key of allowed) if (!found.has(key)) throw new ValidationError('missing required ' + key);
  return { ledger: found.get('--ledger'), json,
    input: { from: found.get('--from'), to: found.get('--to'), currency: found.get('--currency') } };
}

function write(stream, text) {
  return new Promise((resolveWrite, reject) => {
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      // A real Writable can deliver the failed write callback before emitting
      // its error event. Keep the observer through that turn in the error case.
      if (error) setImmediate(() => stream.removeListener('error', onError));
      else stream.removeListener('error', onError);
      if (error) reject(error); else resolveWrite();
    };
    const onError = error => finish(error);
    stream.once('error', onError);
    try { stream.write(text, 'utf8', error => finish(error)); }
    catch (error) { finish(error); }
  });
}

/** Borrowed output streams remain open. Return the process status without exiting. */
export async function main(argv, { stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const options = parse(argv);
    if (options.help) { await write(stdout, HELP); return 0; }
    const envelope = await readPeriodSummary(options.ledger, options.input);
    const text = options.json ? boundedOutput(JSON.stringify(envelope, null, 2) + '\n') : formatPeriodText(envelope);
    await write(stdout, text);
    return 0;
  } catch (error) {
    const status = error instanceof ValidationError ? 2 : 1;
    try { await write(stderr, 'household-period-summary: ' + JSON.stringify(error.message ?? String(error)) + '\n'); }
    catch { return 1; }
    return status;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await main(process.argv.slice(2));
}
