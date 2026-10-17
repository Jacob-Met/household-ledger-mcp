import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packet = dirname(fileURLToPath(import.meta.url));
const receiving = '/workspace/scratch/61749b0088e2/household-complete-receiving';
const source = join(receiving, 'source');
const run = join(packet, 'run');
const hash = value => createHash('sha256').update(value).digest('hex');
const fileListPath = join(receiving, 'publication-file-list.json');
const fileListPin = '934d40e086b33ddb6ac07d2c9028741d166d4afa655c971d6624198cbee431b3';
assert.equal(hash(readFileSync(fileListPath)), fileListPin);
const files = JSON.parse(readFileSync(fileListPath, 'utf8'));
function verifyFrozenProposal() {
  assert.equal(files.length, 88);
  const result = [];
  for (const file of files) {
    const data = readFileSync(file.local_path);
    const sha256 = hash(data);
    assert.equal(sha256, file.sha256, file.path);
    assert.equal(data.length, file.bytes, file.path);
    result.push({ path: file.path, sha256, bytes: data.length });
  }
  assert.equal(hash(readFileSync(fileListPath)), fileListPin);
  return result;
}
const before = verifyFrozenProposal();
mkdirSync(run);
for (const directory of ['state', 'emitted', 'tmp']) mkdirSync(join(run, directory));
const receipt = {
  schema: 'household.import-cashflow.receiving.v1', at: new Date().toISOString(),
  source: { commit: '07e223b5da19cea0f048219d8c85689fcc1ba83f', tree: '76cd2cc60b10dabdd301d32a53da4b833015193d' },
  original_proposal: { file_list_sha256: fileListPin, files: 88, expected_tree: 'a4039c2c4b4ac83c2cf93e87823f0db02e4805f9' },
  runtime: { node: process.version, executable: process.execPath, platform: process.platform, architecture: process.arch },
  scope: 'One public-domain native JSON LedgerStore workflow: categorized CSV import, explicit denominated budgets, monthlySummary plus cashflowTrend, then exact original CSV replay in a distinct sequential Node process. No source edit, installation, HTTP/MCP substitute or concurrent-process writer.',
  invocations: [], passed: false,
};
function child(label, args) {
  const environment = { ...process.env, NODE_DISABLE_COMPILE_CACHE: '1', TMPDIR: join(run, 'tmp') };
  const started = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { cwd: packet, env: environment, encoding: 'utf8', timeout: 30000, maxBuffer: 1024 * 1024 });
  writeFileSync(join(run, label + '.stdout'), result.stdout ?? '', { flag: 'wx' });
  writeFileSync(join(run, label + '.stderr'), result.stderr ?? '', { flag: 'wx' });
  receipt.invocations.push({ label, command: [process.execPath, ...args], cwd: packet, environment_overrides: { NODE_DISABLE_COMPILE_CACHE: '1', TMPDIR: join(run, 'tmp') }, started, ended: new Date().toISOString(), exit_code: result.status, signal: result.signal, error: result.error?.message });
  assert.equal(result.status, 0, `${label}: ${result.stderr}\n${result.stdout}`);
}
try {
  child('compile', [join(packet, 'compile-native.mjs'), source, join(run, 'emitted'), join(run, 'compile.json')]);
  child('initial', [join(packet, 'workflow.mjs'), 'initial', packet, run]);
  child('reopened', [join(packet, 'workflow.mjs'), 'reopened', packet, run]);
  const phases = ['initial', 'reopened'].map(phase => JSON.parse(readFileSync(join(run, phase + '.json'), 'utf8')));
  assert(phases.every(phase => phase.passed));
  receipt.native_processes = phases.map(phase => ({ phase: phase.phase, pid: phase.pid, check_groups: phase.checks.length }));
  receipt.check_groups = phases.reduce((sum, phase) => sum + phase.checks.length, 0);
  receipt.exact_expected_totals = JSON.parse(readFileSync(join(packet, 'expected.json'), 'utf8')).import_totals;
  receipt.saved_snapshot_before_replay = phases[0].saved_snapshot;
  receipt.saved_snapshot_after_replay = phases[1].after;
  receipt.passed = true;
} catch (error) {
  receipt.failure = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  try {
    assert.deepEqual(verifyFrozenProposal(), before);
    receipt.all_88_proposed_paths_unchanged = true;
  } catch (error) {
    receipt.all_88_proposed_paths_unchanged = false;
    receipt.source_failure = { name: error.name, message: error.message };
    receipt.passed = false;
    process.exitCode = 1;
  }
  writeFileSync(join(run, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ passed: receipt.passed, native_processes: receipt.native_processes, check_groups: receipt.check_groups, all_88_proposed_paths_unchanged: receipt.all_88_proposed_paths_unchanged, failure: receipt.failure }));
}
