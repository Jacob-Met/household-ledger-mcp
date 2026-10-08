import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2]);
const prelude = `
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { emptyLedger, recordTransaction, monthlySummary, setBudget, LedgerStore } =
  await import(pathToFileURL(process.env.REVIEW_ROOT + '/dist/src/ledger.js'));
const add = (data, category, type='expense', amountMinor=13, date='2026-10-08') =>
  recordTransaction(data, {category, type, amountMinor, date, currency:'USD'});
`;

const groups = [
  ['all inherited names remain exact own JSON categories', `
    const names = [...Object.getOwnPropertyNames(Object.prototype), 'toJSON', 'groceries', '月の食料', '42'];
    const d = emptyLedger();
    names.forEach((name, i) => { add(d,name,'expense',i+1); add(d,name,'income',i+2); });
    const result = monthlySummary(d,2026,10);
    const wire = JSON.parse(JSON.stringify(result));
    assert.deepEqual(Object.keys(wire.byCategory).sort(), names.slice().sort());
    for (let i=0; i<names.length; i++) {
      assert.equal(Object.hasOwn(wire.byCategory,names[i]),true,names[i]);
      assert.deepEqual(wire.byCategory[names[i]],{incomeMinor:i+2,expenseMinor:i+1});
    }
  `],
  ['summaries preserve every built-in prototype descriptor', `
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    const constructorBefore = Object.getOwnPropertyDescriptors(Object);
    const d=emptyLedger();add(d,'__proto__');add(d,'constructor','income',71);
    monthlySummary(d,2026,10);
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype),before);
    assert.deepEqual(Object.getOwnPropertyDescriptors(Object),constructorBefore);
  `],
  ['frozen prototype is compatible with valid reserved categories', `
    const d=emptyLedger();add(d,'__proto__','expense',19);
    Object.freeze(Object.prototype);
    const r=monthlySummary(d,2026,10);
    assert.equal(r.byCategory['__proto__'].expenseMinor,19);
    assert.equal(r.expenseMinor,19);
  `],
  ['later-month budget-only names do not inherit earlier summaries', `
    const d=emptyLedger();add(d,'__proto__','expense',17);
    setBudget(d,'__proto__','2026-11',100);
    monthlySummary(d,2026,10);
    const next=monthlySummary(d,2026,11);
    assert.deepEqual(JSON.parse(JSON.stringify(next)),{
      year:2026,month:11,incomeMinor:0,expenseMinor:0,netMinor:0,byCategory:{},
      budgets:[{category:'__proto__',limitMinor:100,spentMinor:0,remainingMinor:100,over:false}]
    });
  `],
  ['ordinary sums budgets and serialized shape stay unchanged', `
    const d=emptyLedger();add(d,'food','expense',30);add(d,'food','income',4);
    add(d,'food','expense',99,'2026-09-30');add(d,'travel','expense',8);
    setBudget(d,'food','2026-10',20);setBudget(d,'unused','2026-10',0);
    const r=JSON.parse(JSON.stringify(monthlySummary(d,2026,10)));
    assert.deepEqual(r, {year:2026,month:10,incomeMinor:4,expenseMinor:38,netMinor:-34,
      byCategory:{food:{incomeMinor:4,expenseMinor:30},travel:{incomeMinor:0,expenseMinor:8}},
      budgets:[{category:'food',limitMinor:20,spentMinor:30,remainingMinor:-10,over:true},
               {category:'unused',limitMinor:0,spentMinor:0,remainingMinor:0,over:false}]});
  `],
  ['actual MCP request returns persisted reserved categories without mutating the ledger', `
    const sdk=process.env.REVIEW_ROOT+'/node_modules/@modelcontextprotocol/sdk/dist/esm';
    const { Client } = await import(pathToFileURL(sdk+'/client/index.js'));
    const { InMemoryTransport } = await import(pathToFileURL(sdk+'/inMemory.js'));
    const { createMcpServer } = await import(pathToFileURL(process.env.REVIEW_ROOT+'/dist/src/index.js'));
    const directory=await mkdtemp(join(tmpdir(),'ledger-category-review-'));
    const file=join(directory,'ledger.json'),store=new LedgerStore(file),data=emptyLedger();
    const client=new Client({name:'independent-category-review',version:'1'},{capabilities:{}});
    const server=createMcpServer(store);
    try {
      add(data,'__proto__','expense',42);add(data,'constructor','income',150);
      setBudget(data,'__proto__','2026-10',40);await store.save(data);
      const original=JSON.stringify(await store.load());
      const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
      await server.connect(serverTransport);await client.connect(clientTransport);
      const response=await client.callTool({name:'monthly_summary',arguments:{year:2026,month:10}},undefined,{timeout:1000});
      assert.notEqual(response.isError,true);
      assert.equal(response.content[0].type,'text');
      const result=JSON.parse(response.content[0].text);
      assert.equal(Object.hasOwn(result.byCategory,'__proto__'),true);
      assert.deepEqual(result.byCategory.__proto__,{incomeMinor:0,expenseMinor:42});
      assert.deepEqual(result.byCategory.constructor,{incomeMinor:150,expenseMinor:0});
      assert.deepEqual(result.budgets,[{category:'__proto__',limitMinor:40,spentMinor:42,remainingMinor:-2,over:true}]);
      assert.equal(JSON.stringify(await store.load()),original);
    } finally { await client.close();await server.close();await rm(directory,{recursive:true,force:true}); }
  `],
];

const selected = process.env.REVIEW_CASE ? groups.filter(([name]) => name.startsWith(process.env.REVIEW_CASE)) : groups;
const outcomes = selected.map(([name,body]) => {
  const result=spawnSync(process.execPath,['--input-type=module','-e',prelude+body],{
    env:{...process.env,REVIEW_ROOT:root},encoding:'utf8',timeout:20000,
  });
  const row={name,code:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr};
  console.log(JSON.stringify({name,code:result.status,signal:result.signal}));
  return row;
});
const hash=path => createHash('sha256').update(readFileSync(path)).digest('hex');
const receipt={root,node:process.version,ledgerSha256:hash(join(root,'src/ledger.ts')),
  indexSha256:hash(join(root,'src/index.ts')),lockSha256:hash(join(root,'package-lock.json')),
  compiledLedgerSha256:hash(join(root,'dist/src/ledger.js')),outcomes};
writeFileSync(join(root,process.env.REVIEW_CASE ? 'review-results-bounded-mcp.json' : 'review-results.json'),JSON.stringify(receipt,null,2)+'\n');
if(outcomes.some(row=>row.code!==0))process.exitCode=1;
