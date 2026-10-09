import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, realpath, stat, symlink, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
const [prefixArg, evidenceArg] = process.argv.slice(2);
if (!prefixArg || !evidenceArg || process.argv.length !== 4) {
  throw new Error('Usage: node validation/installed-record.mjs /absolute/install-prefix /NEW/receipt-directory');
}
const prefix = await realpath(prefixArg);
const evidence = resolve(evidenceArg);
await mkdir(evidence); // Deliberately new-only: keep original failed receipts.
const cwd = join(evidence, 'unrelated caller 東京');
await mkdir(cwd);
await writeFile(join(cwd, 'retained.txt'), 'Caller content must remain unchanged.\n');
const sentinel = await readFile(join(cwd, 'retained.txt'));
const bin = join(prefix, 'node_modules', '.bin', 'household-record');
const packageRoot = join(prefix, 'node_modules', 'household-ledger-mcp');
const packageManifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
const receipt = {
  started: new Date().toISOString(), prefix, cwd, bin,
  node: process.execPath, nodeVersion: process.version,
  packageBin: packageManifest.bin, groups: [], processes: [], requests: [],
};
const server = createServer((req, res) => {
  receipt.requests.push({ method: req.method, url: req.url });
  res.writeHead(503); res.end('This boundary must remain unused.');
});
await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
const endpoint = `http://127.0.0.1:${server.address().port}/mcp`;
async function run(label, executable, argv) {
  const started = new Date().toISOString();
  try {
    const r = await execute(executable, argv, { cwd, timeout: 30000, maxBuffer: 1024 * 1024, encoding: 'utf8' });
    const p = { label, executable, argv, started, finished: new Date().toISOString(), exit: 0, stdout: r.stdout, stderr: r.stderr };
    receipt.processes.push(p); return p;
  } catch (e) {
    const p = { label, executable, argv, started, finished: new Date().toISOString(), exit: typeof e.code === 'number' ? e.code : null, code: e.code, signal: e.signal, killed: e.killed, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
    receipt.processes.push(p); return p;
  }
}
async function group(name, fn) { await fn(); receipt.groups.push({ name, passed: true }); }
let failure;
try {
  let help;
  await group('Actual installed OS dispatch from unrelated cwd', async () => {
    help = await run('installed-help', bin, ['--help']);
    assert.equal(help.exit, 0, JSON.stringify(help));
    assert.equal(help.stderr, '');
    assert.match(help.stdout, /Record one household entry/);
    assert.match(help.stdout, /No automatic retry/);
    receipt.resolvedBin = await realpath(bin);
    assert.equal(receipt.resolvedBin, await realpath(join(packageRoot, 'dist', 'src', 'household-record.js')));
    assert.ok((await stat(receipt.resolvedBin)).mode & 0o111);
  });
  const alias = join(cwd, 'linked recording 東京');
  await symlink(bin, alias);
  await group('A second local link dispatches exactly once', async () => {
    const r = await run('linked-help', alias, ['--help']);
    assert.equal(r.exit, 0); assert.equal(r.stderr, ''); assert.equal(r.stdout, help.stdout);
  });
  await group('Node through the installed link preserves direct behavior', async () => {
    const r = await run('node-linked-help', process.execPath, [alias, '--help']);
    assert.equal(r.exit, 0); assert.equal(r.stderr, ''); assert.equal(r.stdout, help.stdout);
  });
  await group('Piped new invocation refuses before contact or request creation', async () => {
    const request = join(cwd, 'must-not-exist.json');
    const r = await run('non-tty', bin, ['new', '--endpoint', endpoint, '--request', request]);
    assert.equal(r.exit, 1); assert.match(r.stderr, /interactive input and output terminal/);
    await assert.rejects(stat(request), { code: 'ENOENT' });
    assert.equal(receipt.requests.length, 0);
  });
  await group('Passive import is inactive', async () => {
    const url = pathToFileURL(join(packageRoot, 'dist', 'src', 'household-record.js')).href;
    const code = `const m=await import(${JSON.stringify(url)});if(typeof m.runRecordCli!=="function")throw Error("missing export");console.log("PASSIVE_IMPORT_ONLY");`;
    const r = await run('passive-import', process.execPath, ['--input-type=module', '--eval', code]);
    assert.equal(r.exit, 0); assert.equal(r.stderr, ''); assert.equal(r.stdout, 'PASSIVE_IMPORT_ONLY\n');
    assert.equal(receipt.requests.length, 0);
  });
  await group('Bad arguments refuse without writes or network', async () => {
    const r = await run('invalid-args', bin, ['unexpected']);
    assert.equal(r.exit, 1); assert.match(r.stderr, /Recording refused/);
    assert.equal(receipt.requests.length, 0);
    assert.deepEqual(await readFile(join(cwd, 'retained.txt')), sentinel);
    assert.deepEqual((await readdir(cwd)).sort(), ['linked recording 東京', 'retained.txt'].sort());
  });
} catch (e) {
  failure = e; receipt.failure = { name: e.name, message: e.message, stack: e.stack };
} finally {
  await new Promise(done => server.close(done));
  receipt.finished = new Date().toISOString();
  receipt.serverClosed = !server.listening;
  receipt.status = failure ? 'failed' : 'passed';
  const script = await readFile(new URL(import.meta.url));
  receipt.driver = { bytes: script.length, sha256: createHash('sha256').update(script).digest('hex') };
  await writeFile(join(evidence, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
}
console.log(JSON.stringify({ status: receipt.status, groups: receipt.groups.length, children: receipt.processes.length, requests: receipt.requests.length, evidence }));
if (failure) process.exitCode = 1;
