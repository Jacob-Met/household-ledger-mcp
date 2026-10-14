import { constants, writeSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { summarizeMonths, NOTICE } from './lib/ledger-months.mjs';

const MAX_BYTES = 16 * 1024 * 1024;
const USAGE = 'Usage: node tools/household-months.mjs --ledger FILE\nDiscover recorded and budget-only months in one saved ledger. Writes JSON to stdout.\n';

function writeAll(fd, text) {
  const bytes = Buffer.from(text, 'utf8');
  let offset = 0;
  while (offset < bytes.length) {
    const n = writeSync(fd, bytes, offset, bytes.length - offset);
    if (n === 0) throw new Error('output write made no progress');
    offset += n;
  }
}

async function readLedger(selector) {
  // Nonblocking open avoids waiting indefinitely on a FIFO before fstat can
  // reject it. Ordinary regular files retain normal read behavior.
  const handle = await open(selector, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error('ledger input must be an existing regular file');
    if (stat.size > MAX_BYTES) throw new Error(`ledger input exceeds ${MAX_BYTES} bytes`);
    const parts = [];
    let total = 0;
    while (total <= MAX_BYTES) {
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_BYTES + 1 - total));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      parts.push(buffer.subarray(0, bytesRead));
      total += bytesRead;
    }
    if (total > MAX_BYTES) throw new Error(`ledger input exceeds ${MAX_BYTES} bytes`);
    return Buffer.concat(parts, total);
  } finally {
    await handle.close();
  }
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    writeAll(1, USAGE);
    return;
  }
  if (args.length !== 2 || args[0] !== '--ledger' || args[1].length === 0) {
    throw new Error(USAGE.trimEnd());
  }
  const selector = args[1];
  const bytes = await readLedger(selector);
  // Preserve a leading BOM so JSON.parse retains its ordinary admission rule.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const summary = summarizeMonths(JSON.parse(text));
  const report = {
    schema_version: 1,
    kind: 'household.saved-months',
    source: { path: selector, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
    ...summary,
    notice: NOTICE,
  };
  writeAll(1, JSON.stringify(report, null, 2) + '\n');
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  process.exitCode = 2;
  const message = error instanceof Error ? error.message : String(error);
  try { writeAll(2, `household-months: ${message}\n`); } catch { /* A failed diagnostic sink cannot be repaired here. */ }
}
