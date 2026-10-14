import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, stat, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Writable } from 'node:stream';
import { summarizePeriod, readPeriodSummary, formatPeriodText, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES,
  MAX_TRANSACTIONS, MAX_BUDGETS, MAX_CATEGORIES } from '../tools/lib/period-summary.mjs';
import { main } from '../tools/household-period-summary.mjs';

const OPTIONS = { from:'2024-02-29', to:'2024-03-01', currency:' usd ' };
const CLI = fileURLToPath(new URL('../tools/household-period-summary.mjs', import.meta.url));
const processes = [];
const observations = [];
const ledger = transactions => ({ version:1, transactions, budgets:[] });
const tx = (type='expense', amountMinor=1, category='Food', date='2024-02-29', currency='USD') =>
  ({id:'repeated-id',type,amountMinor,category,date,currency,note:'private note stays outside report'});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const counts = (income,expense) => ({transactions:income+expense,income,expense});

after(async () => {
  if (process.env.PERIOD_TEST_REPORT) await writeFile(process.env.PERIOD_TEST_REPORT,
    JSON.stringify({observations,processes},null,2)+'\n',{flag:'wx'});
});

async function scratch(t) {
  const path = await mkdtemp(join(tmpdir(),'household-period-test-'));
  t.after(() => rm(path,{recursive:true,force:true}));
  return path;
}

function child(args) {
  const r = spawnSync(process.execPath,['--experimental-transform-types',CLI,...args],
    {encoding:'utf8',input:'',timeout:10000,killSignal:'SIGKILL',maxBuffer:16*1024*1024,
     env:Object.fromEntries(Object.entries(process.env).filter(([k])=>!['NODE_OPTIONS','NODE_PATH'].includes(k)))});
  processes.push({args,pid:r.pid,status:r.status,signal:r.signal,error:r.error?String(r.error):null,
    stdout:r.stdout,stderr:r.stderr});
  assert.equal(r.error,undefined);assert.equal(r.signal,null);assert.notEqual(r.status,null);
  return r;
}

function sink(fail=false) {
  let text='';
  const stream=new Writable({autoDestroy:false,write(chunk,encoding,callback) {
    if (fail) callback(Object.assign(new Error('owned unavailable output'),{code:'EPIPE'}));
    else {text+=chunk.toString();callback();}
  }});
  return {stream,get text(){return text;}};
}

test('complete cross-month projection preserves occurrence, currency and literal category semantics', () => {
  const data=ledger([
    tx('income',80,'Pay','2024-02-28'),
    tx('income',23,'Pay'),
    tx('expense',7,'Food'),
    tx('expense',11,'Food','2024-03-01',' usd '),
    tx('income',3,'Food','2024-03-01'),
    tx('expense',2,'Food '),
    tx('expense',5,'__proto__'),
    tx('expense',13,'Food','2024-03-01','EUR'),
    tx('expense',90,'Food','2024-03-02'),
  ]);
  data.budgets=[{category:'Legacy','month':'2024-02',limitMinor:0}];
  const before=JSON.stringify(data);
  const actual=summarizePeriod(data,OPTIONS);
  const expected={format:'household-period-summary',version:1,from:'2024-02-29',to:'2024-03-01',currency:'USD',
    counts:counts(2,4),totals:{incomeMinor:26,expenseMinor:25,netMinor:1},categories:[
      {category:'Food',counts:counts(1,2),incomeMinor:3,expenseMinor:18,netMinor:-15},
      {category:'Food ',counts:counts(0,1),incomeMinor:0,expenseMinor:2,netMinor:-2},
      {category:'Pay',counts:counts(1,0),incomeMinor:23,expenseMinor:0,netMinor:23},
      {category:'__proto__',counts:counts(0,1),incomeMinor:0,expenseMinor:5,netMinor:-5},
    ]};
  observations.push({name:'complete_manual_matrix',actual});assert.deepEqual(actual,expected);
  assert.equal(JSON.stringify(data),before);
  actual.categories[0].category='changed returned value';actual.counts.transactions=0;
  assert.equal(JSON.stringify(data),before);
  const euro=summarizePeriod(data,{...OPTIONS,currency:'EUR'});
  assert.deepEqual(euro.totals,{incomeMinor:0,expenseMinor:13,netMinor:-13});assert.deepEqual(euro.counts,counts(0,1));
  const single=summarizePeriod(data,{from:'2024-03-01',to:'2024-03-01',currency:'USD'});
  assert.deepEqual(single.counts,counts(1,1));assert.deepEqual(single.totals,{incomeMinor:3,expenseMinor:11,netMinor:-8});
  const empty=summarizePeriod(data,{from:'2025-01-01',to:'2025-01-31',currency:'USD'});
  assert.deepEqual(empty.categories,[]);assert.deepEqual(empty.counts,counts(0,0));
  assert.deepEqual(empty.totals,{incomeMinor:0,expenseMinor:0,netMinor:0});assert.ok(!Object.is(empty.totals.netMinor,-0));
  const labels=['\uE000','😀',' leading','trailing ','a\r\nb','__proto__','constructor'];
  const literal=summarizePeriod(ledger(labels.map(x=>tx('expense',1,x))),OPTIONS);
  assert.deepEqual(literal.categories.map(x=>x.category),[' leading','__proto__','a\r\nb','constructor','trailing ','😀','\uE000']);
  assert.ok(!JSON.stringify(literal).includes('private note'));
});

test('whole-input admission, exact safe-integer arithmetic and complete finite bounds', () => {
  const max=Number.MAX_SAFE_INTEGER;
  const exact=summarizePeriod(ledger([tx('income',max),tx('expense',max)]),OPTIONS);
  assert.deepEqual(exact.totals,{incomeMinor:max,expenseMinor:max,netMinor:0});assert.ok(!Object.is(exact.totals.netMinor,-0));
  for(const rows of [[tx('income',max),tx('income',1)],
    [tx('income',max),tx('expense',max),tx('income',1),tx('expense',1)]])
    assert.throws(()=>summarizePeriod(ledger(rows),OPTIONS),/gross.*safe integer/);
  assert.equal(summarizePeriod(ledger([tx('expense',1),tx('expense',max,'Other','2024-02-29','EUR')]),OPTIONS).totals.expenseMinor,1);
  for(const options of [null,[],{}, {...OPTIONS,extra:1},{...OPTIONS,to:'2024-02-28'},
    {...OPTIONS,from:'2023-02-29'},{...OPTIONS,currency:'US'},{...OPTIONS,currency:1},
    Object.assign({...OPTIONS},{[Symbol('hidden')]:true}),Object.defineProperty({...OPTIONS},'hidden',{value:true})])
    assert.throws(()=>summarizePeriod(ledger([]),options));
  let reads=0;const options={...OPTIONS};Object.defineProperty(options,'currency',{get(){reads++;return 'USD';}});
  summarizePeriod(ledger([]),options);assert.equal(reads,1);
  const late=ledger([tx(),tx('expense',0,'Other','2025-01-01','EUR')]);
  assert.throws(()=>summarizePeriod(late,OPTIONS),/positive integer/);
  const invalidBudget=ledger([tx()]);invalidBudget.budgets=[{category:'Other',month:'2025-01',limitMinor:-1}];
  assert.throws(()=>summarizePeriod(invalidBudget,OPTIONS),/non-negative/);
  const many=ledger(Array(MAX_TRANSACTIONS).fill(tx()));
  assert.equal(summarizePeriod(many,OPTIONS).counts.transactions,MAX_TRANSACTIONS);
  many.transactions.push(tx());assert.throws(()=>summarizePeriod(many,OPTIONS),/100000 transactions/);
  const budgets=ledger([]);budgets.budgets=Array(MAX_BUDGETS).fill({category:'Legacy',month:'2025-01',limitMinor:0});
  assert.equal(summarizePeriod(budgets,OPTIONS).counts.transactions,0);
  budgets.budgets.push(budgets.budgets[0]);assert.throws(()=>summarizePeriod(budgets,OPTIONS),/100000 budgets/);
  const categories=ledger(Array.from({length:MAX_CATEGORIES},(_,i)=>tx('expense',1,'category-'+i)));
  assert.equal(summarizePeriod(categories,OPTIONS).categories.length,MAX_CATEGORIES);
  categories.transactions.push(tx('expense',1,'extra'));assert.throws(()=>summarizePeriod(categories,OPTIONS),/5000 literal categories/);
  const template={format:'household-period-summary',version:1,from:OPTIONS.from,to:OPTIONS.to,currency:'USD',
    counts:counts(0,1),totals:{incomeMinor:0,expenseMinor:1,netMinor:-1},
    categories:[{category:'x',counts:counts(0,1),incomeMinor:0,expenseMinor:1,netMinor:-1}]};
  const overhead=Buffer.byteLength(JSON.stringify(template,null,2)+'\n')-1;
  const label='x'.repeat(MAX_OUTPUT_BYTES-overhead);
  assert.equal(Buffer.byteLength(JSON.stringify(summarizePeriod(ledger([tx('expense',1,label)]),OPTIONS),null,2)+'\n'),MAX_OUTPUT_BYTES);
  assert.throws(()=>summarizePeriod(ledger([tx('expense',1,label+'x')]),OPTIONS),/4 MiB/);
  observations.push({name:'exact_limits',safeInteger:max,inputRows:MAX_TRANSACTIONS,budgets:MAX_BUDGETS,categories:MAX_CATEGORIES,resultBytes:MAX_OUTPUT_BYTES});
});

test('real CLI JSON, text, help and argument refusals preserve the explicit input', async t => {
  const dir=await scratch(t);const path=join(dir,'literal café ledger.json');
  const data=ledger([tx('income',31,'Work'),tx('expense',9,'=literal\r\nnote','2024-03-01')]);
  const raw=Buffer.from(JSON.stringify(data,null,2)+'\n');await writeFile(path,raw);
  const before=await stat(path,{bigint:true});
  const args=['--ledger',path,'--from',OPTIONS.from,'--to',OPTIONS.to,'--currency','usd'];
  const json=child([...args,'--json']);assert.equal(json.status,0);
  const envelope=JSON.parse(json.stdout);assert.equal(envelope.source.path,resolve(path));
  assert.deepEqual(envelope.source,{path:resolve(path),bytes:raw.length,sha256:digest(raw)});
  assert.deepEqual(envelope.summary.totals,{incomeMinor:31,expenseMinor:9,netMinor:22});
  assert.equal(json.stdout,JSON.stringify(envelope,null,2)+'\n');
  const text=child(args);assert.equal(text.status,0);assert.equal(text.stdout,formatPeriodText(envelope));
  assert.ok(text.stdout.includes('"=literal\\r\\nnote"'));assert.ok(text.stdout.includes('not an account balance'));
  const help=child(['--help']);assert.equal(help.status,0);assert.match(help.stdout,/--from.*--to/);
  const duplicate=child([...args,'--currency','EUR']);assert.equal(duplicate.status,2);assert.equal(duplicate.stdout,'');
  const reversed=child(['--ledger',path,'--from',OPTIONS.to,'--to',OPTIONS.from,'--currency','USD']);
  assert.equal(reversed.status,2);assert.equal(reversed.stdout,'');assert.match(reversed.stderr,/on or after/);
  assert.deepEqual(await readFile(path),raw);const afterStat=await stat(path,{bigint:true});
  for(const key of ['dev','ino','size','mtimeNs','mode'])assert.equal(afterStat[key],before[key]);
  observations.push({name:'actual_cli_envelope',envelope,sourcePreserved:true});
});

test('ordinary files, strict UTF-8, exact byte limits and borrowed output failures', async t => {
  const dir=await scratch(t);const path=join(dir,'ledger.json');const good=JSON.stringify(ledger([tx()]));await writeFile(path,good);
  const stdout=sink(),stderr=sink();
  const args=['--ledger',path,'--from',OPTIONS.from,'--to',OPTIONS.to,'--currency','USD','--json'];
  assert.equal(await main(args,{stdout:stdout.stream,stderr:stderr.stream}),0);
  assert.equal(stderr.text,'');assert.equal(stdout.stream.writableEnded,false);assert.equal(stdout.stream.destroyed,false);
  const failed=sink(true),errorSink=sink();
  assert.equal(await main(args,{stdout:failed.stream,stderr:errorSink.stream}),1);
  await new Promise(resolve=>setImmediate(resolve));assert.match(errorSink.text,/owned unavailable output/);
  assert.equal(errorSink.stream.writableEnded,false);assert.equal(failed.stream.writableEnded,false);
  const failedHelp=sink(true),helpError=sink();
  assert.equal(await main(['--help'],{stdout:failedHelp.stream,stderr:helpError.stream}),1);
  await new Promise(resolve=>setImmediate(resolve));assert.match(helpError.text,/owned unavailable output/);
  for(const argv of [[...args,'--json'],['--help','--json'],['--ledger','--from'],[...args,'--unknown']]) {
    const out=sink(),err=sink();assert.equal(await main(argv,{stdout:out.stream,stderr:err.stream}),2);assert.equal(out.text,'');
  }
  const nonregular=join(dir,'directory');await mkdir(nonregular);
  const link=join(dir,'linked.json');await symlink(path,link);
  const missing=join(dir,'missing.json');
  for(const name of [nonregular,link,missing]) {
    const out=sink(),err=sink();assert.equal(await main(['--ledger',name,...args.slice(2)],{stdout:out.stream,stderr:err.stream}),1);assert.equal(out.text,'');
  }
  assert.deepEqual(await readFile(path),Buffer.from(good));
  const bad=join(dir,'bad.json');
  for(const bytes of [Buffer.from([0xff]),Buffer.from('{'),Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(good)])]) {
    await writeFile(bad,bytes);const out=sink(),err=sink();
    assert.equal(await main(['--ledger',bad,...args.slice(2)],{stdout:out.stream,stderr:err.stream}),2);assert.equal(out.text,'');
    assert.deepEqual(await readFile(bad),bytes);
  }
  const padded=Buffer.from(good+' '.repeat(MAX_INPUT_BYTES-Buffer.byteLength(good)));
  await writeFile(bad,padded);assert.equal((await readPeriodSummary(bad,OPTIONS)).source.bytes,MAX_INPUT_BYTES);
  await writeFile(bad,Buffer.concat([padded,Buffer.from(' ')]));await assert.rejects(readPeriodSummary(bad,OPTIONS),/8 MiB/);
  // A literal dash is an ordinary pathname, not an instruction to read stdin.
  const dash=join(dir,'-');await writeFile(dash,good);assert.equal((await readPeriodSummary(dash,OPTIONS)).summary.counts.transactions,1);
  observations.push({name:'file_and_stream_boundaries',inputBytes:MAX_INPUT_BYTES,borrowedStreamsClosed:false});
});
