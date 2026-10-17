import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const [sourceArg, outputArg, receiptArg] = process.argv.slice(2);
const source = resolve(sourceArg);
const output = resolve(outputArg);
const require = createRequire(import.meta.url);
const compilerPath = realpathSync('/workspace/scratch/acd057031fb2/agents/coordination/uma-current/packages/uma-sim-ui/node_modules/typescript/lib/typescript.js');
const typeRoot = '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/@types';
const ts = require(compilerPath);
const hash = value => createHash('sha256').update(value).digest('hex');
const inputs = ['ledger.ts', 'transaction-csv.ts', 'transaction-import.ts', 'cashflow.ts'];
const configuration = ts.readConfigFile(join(source, 'tsconfig.json'), ts.sys.readFile);
assert.equal(configuration.error, undefined);
const parsed = ts.parseJsonConfigFileContent(configuration.config, ts.sys, source);
assert.deepEqual(parsed.errors, []);
const options = {
  ...parsed.options,
  rootDir: join(source, 'src'), outDir: output,
  declaration: false, sourceMap: false, incremental: false,
  types: ['node'], typeRoots: [typeRoot], noEmitOnError: true,
};
const program = ts.createProgram(inputs.map(name => join(source, 'src', name)), options);
const diagnostics = ts.getPreEmitDiagnostics(program);
const emitted = [];
const result = program.emit(undefined, (path, content) => {
  const absolute = resolve(path);
  assert(absolute.startsWith(output + '/'), 'Compiler output must stay in the new supplement');
  writeFileSync(absolute, content, { flag: 'wx' });
  emitted.push({ path: relative(output, absolute), sha256: hash(content), bytes: Buffer.byteLength(content) });
});
const allDiagnostics = [...diagnostics, ...result.diagnostics];
const receipt = {
  schema: 'household.receiving.four-module-compile.v1',
  at: new Date().toISOString(), node: process.version, platform: process.platform, architecture: process.arch,
  compiler: { path: compilerPath, version: ts.version, sha256: hash(readFileSync(compilerPath)) },
  node_types: { path: join(typeRoot, 'node'), version: JSON.parse(readFileSync(join(typeRoot, 'node/package.json'), 'utf8')).version },
  original_lock_node_types: JSON.parse(readFileSync(join(source, 'package-lock.json'), 'utf8')).packages['node_modules/@types/node'].version,
  scope: 'Strict four-module native domain dependency compile only; original tsconfig options retained except output artifacts and existing explicit type roots. Does not compile MCP entry points or the original test suite.',
  effective_options: options,
  roots: inputs.map(name => 'src/' + name),
  loaded_inputs: program.getSourceFiles().map(file => ({ path: file.fileName, bytes: Buffer.byteLength(file.text), sha256: hash(readFileSync(file.fileName)) })),
  diagnostics: allDiagnostics.map(diagnostic => ({
    category: ts.DiagnosticCategory[diagnostic.category], code: diagnostic.code,
    file: diagnostic.file?.fileName, start: diagnostic.start,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  })),
  emit_skipped: result.emitSkipped,
  emitted,
  passed: allDiagnostics.length === 0 && !result.emitSkipped && emitted.length === 4,
};
writeFileSync(receiptArg, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
assert.equal(receipt.passed, true, JSON.stringify(receipt.diagnostics));
writeFileSync(join(output, 'package.json'), '{"type":"module"}\n', { flag: 'wx' });
console.log(JSON.stringify({ passed: true, compiler: ts.version, node_types: receipt.node_types.version, native_modules: emitted.length, diagnostics: 0 }));
