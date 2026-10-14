import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const input = readFileSync(resolve(root, 'original/src/ledger.ts'));
const blob = createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${input.length}\0`), input])).digest('hex');
if (blob !== '2ff8133404f19c705eb7b7f0a943e8190f3328d6') throw new Error('native source drift');
const output = stripTypeScriptTypes(input.toString('utf8'), { mode: 'transform', sourceMap: false });
const dest = resolve(root, 'candidate/dist/src/ledger.js');
if (existsSync(dest)) throw new Error('refuse replacing transform');
mkdirSync(resolve(root, 'candidate/dist/src'), { recursive: true });
writeFileSync(dest, output, { mode: 0o644, flag: 'wx' });
const b = Buffer.from(output);
console.log(JSON.stringify({ node: process.version, method: 'node:module.stripTypeScriptTypes mode=transform sourceMap=false', input: { bytes: input.length, git_blob: blob, sha256: createHash('sha256').update(input).digest('hex') }, output: { path: dest, bytes: b.length, sha256: createHash('sha256').update(b).digest('hex') }, limit: 'Standard Node24 transform of exact inherited module; no tsc/typecheck/full build claim.' }));
