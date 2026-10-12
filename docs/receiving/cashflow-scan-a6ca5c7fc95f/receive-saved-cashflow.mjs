#!/usr/bin/env node
// Independent saved-file behavioral receiver. No production writes or network.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const [beforeDir, afterDir, outputDir] = process.argv.slice(2);
if (!beforeDir || !afterDir || !outputDir || process.argv.length !== 5) {
  console.error('Usage: node receive-saved-cashflow.mjs BEFORE_EMITTED_DIR AFTER_EMITTED_DIR NEW_OUTPUT_DIR');
  process.exit(2);
}
const out = path.resolve(outputDir);
await fs.mkdir(out); // Exclusive new result directory; never replace one.
const fixtures = path.join(out, 'fictional-ledgers');
await fs.mkdir(fixtures);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const snapshot = async name => {
  const data = await fs.readFile(name), stat = await fs.stat(name, { bigint: true });
  return { bytes: data.length, sha256: sha(data), mtimeNs: stat.mtimeNs.toString() };
};
const pins = {};
for (const [name, dir] of [['before', beforeDir], ['after', afterDir]]) {
  pins[name] = {};
  for (const file of ['ledger.js', 'cashflow.js']) pins[name][file] = await snapshot(path.join(dir, file));
}
const modules = {};
for (const [name, dir] of [['before', beforeDir], ['after', afterDir]]) {
  modules[name] = {
    ...(await import(pathToFileURL(path.resolve(dir, 'ledger.js')).href)),
    ...(await import(pathToFileURL(path.resolve(dir, 'cashflow.js')).href)),
  };
}
let identifier = 0;
function tx(date, type, amountMinor, currency = 'USD', category = 'food') {
  return { id: `fictional-${++identifier}`, date, type, amountMinor, currency, category, createdAt: '2026-01-01T00:00:00.000Z' };
}
const ledger = (transactions = [], budgets = [], version = 2) => ({ version, transactions, budgets });
const request = (fromMonth, toMonth, currency) => ({ fromMonth, toMonth, ...(currency === undefined ? {} : { currency }) });
const normal = request('2024-12', '2025-02', 'USD');
const cases = [];
const saved = [];
async function add(name, data, requests) {
  const filename = path.join(fixtures, name + '.json');
  await fs.writeFile(filename, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
  saved.push({ filename, initial: await snapshot(filename) });
  for (let i = 0; i < requests.length; i++) cases.push({ name: name + '/' + i, filename, input: requests[i] });
}

const manual = ledger([
  tx('2024-12-01', 'income', 1000, 'USD', 'salary'),
  tx('2024-12-31', 'expense', 400),
  tx('2025-02-01', 'income', 100, 'USD', 'salary'),
  tx('2025-02-28', 'expense', 150),
], [
  { category: 'food', month: '2024-12', limitMinor: 500, currency: 'USD' },
  { category: 'bill', month: '2025-01', limitMinor: 50, currency: 'USD' },
  { category: 'food', month: '2025-02', limitMinor: 100, currency: 'USD' },
]);
await add('manual-three-months', manual, [normal]);
await add('empty-v1', ledger([], [], 1), [normal, request('1970-01','1970-02'), request('9999-11','9999-12',' jpy '), request('2020-01','2029-12')]);
await add('empty-v2', ledger(), [request('2025-01','2025-01'),request('2025-01','2025-01','usd'),request('2025-01','2025-02')]);
const planned = ledger([], [
  { category:'rent', month:'2024-12', limitMinor:0, currency:' usd ' },
  { category:'rent', month:'2025-01', limitMinor:100, currency:'EUR' },
  { category:'other', month:'2025-02', limitMinor:50, currency:'USD' },
]);
await add('planned-only', planned, [request('2024-12','2025-02'),normal,request('2024-12','2025-02','EUR'),request('2025-01','2025-01','JPY')]);
const categories = ['__proto__','constructor','2','10','01','日本語\r\nline','<script>fiction</script>','food'];
const months = ['2023-01','2024-12','2025-01','2025-02','2025-06','2029-12'];
for (let seed = 0; seed < 18; seed++) {
  const transactions = [];
  const budgets = [];
  for (let i=0;i<72;i++) {
    const month=months[(i*7+seed)%months.length];
    transactions.push(tx(month+'-'+String((i%27)+1).padStart(2,'0'),i%3?'expense':'income',1+(i*17+seed*31)%20000,(i+seed)%4?' usd ':'EUR',categories[(i+seed)%categories.length]));
  }
  for (let i=0;i<months.length;i++) budgets.push({category:categories[i],month:months[i],limitMinor:i*333,currency:i%2?'USD':'EUR'});
  if(seed%2) transactions.reverse();
  if(seed%3) budgets.reverse();
  await add('varied-'+seed,ledger(transactions,budgets),[
    normal,request('2024-12','2025-02','EUR'),request('2025-01','2025-01','uSd'),
    request('2020-01','2029-12','JPY'),request('2024-12','2025-02'),
    request('2025-02','2025-06','EUR'),request('2024-11','2025-01','USD'),
  ]);
}
const legacy = month => [{category:'food',month,limitMinor:250}];
await add('legacy-supported',ledger([tx('2024-12-15','expense',100)],legacy('2024-12'),1),[normal,request('2024-12','2025-02'),request('2024-12','2025-02','EUR')]);
await add('legacy-empty-month',ledger([tx('2024-12-15','expense',100)],legacy('2025-01'),1),[normal,request('2024-12','2025-02'),request('2024-12','2024-12')]);
await add('legacy-mixed',ledger([tx('2024-12-15','expense',100),tx('2024-12-20','income',200,'EUR')],legacy('2024-12'),1),[normal,request('2024-12','2025-02','EUR'),request('2024-12','2025-02')]);
const max=Number.MAX_SAFE_INTEGER;
await add('monthly-gross-overflow',ledger([tx('2025-01-01','income',max),tx('2025-01-02','income',1),tx('2025-02-01','expense',1)]),[normal,request('2025-01','2025-01','USD'),request('2024-12','2025-02','EUR')]);
await add('period-gross-overflow',ledger([tx('2024-12-01','income',max),tx('2025-02-01','income',1),tx('2024-12-02','expense',max)]),[normal,request('2024-12','2024-12','USD')]);
await add('period-expense-overflow',ledger([tx('2024-12-01','expense',max),tx('2025-02-01','expense',1),tx('2024-12-02','income',max)]),[normal]);
await add('safe-boundary',ledger([tx('2024-12-01','income',max),tx('2025-02-01','expense',max)]),[normal,request('2024-12','2025-02')]);
const badDate=ledger([tx('2023-02-30','income',1)]);
const badCurrency=ledger([tx('2023-01-01','income',1,'not-currency')]);
const duplicateKey=ledger([{...tx('2025-01-01','income',1),idempotencyKey:'fictional'}, {...tx('2025-01-02','income',1),idempotencyKey:'fictional'}]);
const badVersion=ledger([],[],3);
const duplicateBudgets=ledger([],[{category:'food',month:'2025-01',limitMinor:1,currency:'USD'},{category:'food',month:'2025-01',limitMinor:2,currency:'usd'}]);
for (const [name,data] of Object.entries({badDate,badCurrency,duplicateKey,badVersion,duplicateBudgets})) await add(name,data,[normal]);
await add('invalid-requests',manual,[null,[],{}, {fromMonth:'2025-01'},request('2025-01','2024-12'),request('2020-01','2030-01'),request('1969-12','1970-01'),request('9999-12','10000-01'),request('2025-00','2025-01'),request('2025-01','2025-02',''),request('2025-01','2025-02',null),request('2025-01','2025-02',27)]);
const absent=path.join(fixtures,'never-created.json');
cases.push({name:'missing-file-remains-missing',filename:absent,input:normal});
await fs.writeFile(path.join(out,'requests.json'),JSON.stringify(cases,null,2)+'\n',{flag:'wx'});

const results=[];
let manualResult;
for(const item of cases) {
  const outcomes={};
  for(const label of ['before','after']) {
    const module=modules[label];
    try {
      const data=await new module.LedgerStore(item.filename).load();
      const memoryBefore=JSON.stringify(data), inputBefore=JSON.stringify(item.input);
      const value=module.cashflowTrend(data,item.input);
      if(JSON.stringify(data)!==memoryBefore||JSON.stringify(item.input)!==inputBefore) throw new Error('Receiver detected mutation');
      outcomes[label]={ok:true,value};
    } catch(error) {
      if(error.message==='Receiver detected mutation') throw error;
      outcomes[label]={ok:false,error:{type:error.constructor.name,message:error.message}};
    }
  }
  const before=JSON.stringify(outcomes.before),after=JSON.stringify(outcomes.after);
  if(before!==after) {
    await fs.writeFile(path.join(out,'MISMATCH.json'),JSON.stringify({item,outcomes},null,2)+'\n');
    throw new Error('Complete outcome mismatch: '+item.name);
  }
  results.push({name:item.name,input:item.input,outcome:outcomes.after.ok?'returned':'refused',sha256:sha(after),...(outcomes.after.ok?{monthCount:outcomes.after.value.monthCount}:outcomes.after)});
  if(item.name==='manual-three-months/0') manualResult=outcomes.after.value;
}
if(JSON.stringify(manualResult.totals)!==JSON.stringify({incomeMinor:1100,expenseMinor:550,netMinor:550})||JSON.stringify(manualResult.months.map(x=>x.cumulativeNetMinor))!=='[600,600,550]') throw new Error('Manual arithmetic differs');
for(const item of saved) if(JSON.stringify(await snapshot(item.filename))!==JSON.stringify(item.initial)) throw new Error('Saved input changed: '+item.filename);
try {await fs.lstat(absent);throw new Error('Missing input was created');} catch(error){if(error.code!=='ENOENT') throw error;}
for(const [name,dir] of [['before',beforeDir],['after',afterDir]]) for(const file of ['ledger.js','cashflow.js']) if(JSON.stringify(await snapshot(path.join(dir,file)))!==JSON.stringify(pins[name][file])) throw new Error('Source changed');
await fs.writeFile(path.join(out,'manual-three-months-result.json'),JSON.stringify(manualResult,null,2)+'\n',{flag:'wx'});
const receipt={schema:'cashflow-saved-file-receiving/v1',receiver:'a6ca5c7fc95f/Delivery',node:process.version,status:'passed',sourcePins:pins,requests:results.length,returned:results.filter(x=>x.outcome==='returned').length,refused:results.filter(x=>x.outcome==='refused').length,savedFilesUnchanged:saved.length,missingFileRemainedMissing:true,manualArithmeticPassed:true,results,qualification:'Source-informed independent saved-file comparison. Fictional JSON only. No benchmark claim, held #20 gate, installation or service adoption.'};
await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:receipt.status,requests:receipt.requests,returned:receipt.returned,refused:receipt.refused,savedFilesUnchanged:receipt.savedFilesUnchanged,receiptSha256:sha(JSON.stringify(receipt,null,2)+'\n')},null,2));
