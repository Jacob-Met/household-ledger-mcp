import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LedgerStore, monthlySummary, recordTransaction, setBudget, type LedgerData } from "../src/ledger.js";
import { commitBudgetReallocation as commit, previewBudgetReallocation as preview, type BudgetReallocationReview } from "../src/budget-reallocation.js";

const request = { month: "2026-10", currency: "USD", fromCategory: "food", toCategory: "travel", amountMinor: 250 };
function ledger(): LedgerData {
  return { version: 2, transactions: [{id:"original",type:"expense",amountMinor:300,currency:"USD",date:"2026-10-02",category:"food",note:"retained",idempotencyKey:"original-key",createdAt:"2026-10-02T01:00:00Z"}],
    budgets: [{category:"food",month:"2026-10",currency:"USD",limitMinor:1000},{category:"travel",month:"2026-10",currency:"USD",limitMinor:500},{category:"food",month:"2026-10",currency:"EUR",limitMinor:800}] };
}
async function fixture(run: (store: LedgerStore, path: string, dir: string) => Promise<void>, data = ledger()): Promise<void> {
 const dir=await mkdtemp(join(tmpdir(),"household-reallocation-"));const path=join(dir,"ledger.json");
 try{await writeFile(path,JSON.stringify(data));await run(new LedgerStore(path),path,dir);}finally{await chmod(dir,0o700);await rm(dir,{recursive:true,force:true});}
}
test("review is read-only; commit moves both limits and native summary preserves transactions and spending",()=>fixture(async(store,path)=>{
 const bytes=await readFile(path);const before=await stat(path);const original=await store.load();
 const review=await preview(store,request);
 assert.deepEqual(review.from,{category:"food",beforeMinor:1000,afterMinor:750});
 assert.deepEqual(review.to,{category:"travel",beforeMinor:500,afterMinor:750});assert.equal(review.totalMinor,1500);
 assert.deepEqual(await readFile(path),bytes);assert.equal((await stat(path)).mtimeMs,before.mtimeMs);
 assert.equal((await commit(store,{review})).status,"applied");
 const result=await store.load();assert.deepEqual(result.transactions,original.transactions);assert.deepEqual(result.budgets[2],original.budgets[2]);
 assert.equal(result.version,original.version);assert.deepEqual(result.budgets.slice(0,2).map(b=>b.limitMinor),[750,750]);
 const summary=monthlySummary(result,2026,10,"USD");assert.equal(summary.expenseMinor,300);
 assert.deepEqual(summary.budgets.map(b=>[b.category,b.remainingMinor,b.over]),[["food",450,false],["travel",750,false]]);
}));
test("unrelated fresh recording and budget edits survive the reviewed pair commit",()=>fixture(async(store)=>{
 const review=await preview(store,request);
 await store.update(data=>{recordTransaction(data,{type:"income",amountMinor:5000,currency:"USD",date:"2026-10-03",category:"salary",idempotencyKey:"new"});setBudget(data,"other","2026-10",333,"USD");});
 const fresh=await store.load();await commit(store,{review});const result=await store.load();
 assert.deepEqual(result.transactions,fresh.transactions);assert.deepEqual(result.budgets.slice(2),fresh.budgets.slice(2));
}));
test("concurrent identical commits apply once and matching replay never writes, including new Store",()=>fixture(async(store,path)=>{
 const review=await preview(store,request);
 const results=await Promise.all([commit(store,{review}),commit(new LedgerStore(path),{review})]);
 assert.deepEqual(results.map(r=>r.status).sort(),["already_matching","applied"]);
 const bytes=await readFile(path),info=await stat(path);
 assert.equal((await commit(new LedgerStore(path),{review})).status,"already_matching");
 assert.deepEqual(await readFile(path),bytes);assert.equal((await stat(path)).mtimeMs,info.mtimeMs);
}));
test("competing reviewed amounts serialize without partial or lost allowance",()=>fixture(async(store,path)=>{
 const a=await preview(store,request),b=await preview(store,{...request,amountMinor:350});
 const results=await Promise.allSettled([commit(store,{review:a}),commit(new LedgerStore(path),{review:b})]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected").length,1);
 assert.deepEqual((await store.load()).budgets.slice(0,2).map(b=>b.limitMinor),[750,750]);
}));
for(const change of ["source","destination","mixed","removed"]){
 test("stale "+change+" pair refuses without a write",()=>fixture(async(store,path)=>{
  const review=await preview(store,request);
  await store.update(data=>{if(change==="removed")data.budgets.splice(1,1);else if(change==="destination")data.budgets[1].limitMinor=501;else data.budgets[0].limitMinor=change==="mixed"?750:999;});
  const bytes=await readFile(path);await assert.rejects(commit(store,{review}),/changed|existing explicitly/);assert.deepEqual(await readFile(path),bytes);
 }));
}
test("failed OS persistence keeps original bytes; fresh unrelated edit and retry succeed",()=>fixture(async(store,path,dir)=>{
 assert.notEqual(process.getuid?.(),0,"requires ordinary user to exercise directory refusal");
 const review=await preview(store,request);const bytes=await readFile(path);
 await chmod(dir,0o500);
 try{await assert.rejects(commit(store,{review}),/EACCES|permission/i);assert.deepEqual(await readFile(path),bytes);}
 finally{await chmod(dir,0o700);}
 await store.update(data=>setBudget(data,"later","2026-11",99,"GBP"));
 assert.equal((await commit(store,{review})).status,"applied");
 assert.equal((await store.load()).budgets.at(-1)?.limitMinor,99);assert.deepEqual(await readdir(dir),["ledger.json"]);
}));
test("zero source endpoint and MAX_SAFE total are representable exactly",()=>fixture(async(store)=>{
 await store.update(data=>{data.budgets[0].limitMinor=1;data.budgets[1].limitMinor=Number.MAX_SAFE_INTEGER-1;});
 const review=await preview(store,{...request,amountMinor:1});await commit(store,{review});
 assert.deepEqual((await store.load()).budgets.slice(0,2).map(b=>b.limitMinor),[0,Number.MAX_SAFE_INTEGER]);
}));
test("literal legacy category and currency bytes are retained without normalization",()=>fixture(async(store)=>{
 await store.update(data=>{data.budgets[0].category=" food ";data.budgets[0].currency=" usd ";data.budgets[1].category="__proto__";});
 const review=await preview(store,{...request,fromCategory:" food ",toCategory:"__proto__",currency:" usd "});
 assert.equal(review.currency,"USD");await commit(store,{review});const rows=(await store.load()).budgets;
 assert.equal(rows[0].category," food ");assert.equal(rows[0].currency," usd ");assert.equal(rows[1].category,"__proto__");
 await assert.rejects(preview(store,{...request,toCategory:"__proto__"}),/existing explicitly/);
}));
for(const [label,patch] of [
 ["same category",{toCategory:"food"}],["missing category",{toCategory:"absent"}],["wrong month",{month:"2026-11"}],
 ["wrong currency",{currency:"GBP"}],["blank currency",{currency:""}],["fraction",{amountMinor:0.5}],["zero",{amountMinor:0}],
 ["negative",{amountMinor:-1}],["unsafe",{amountMinor:Number.MAX_SAFE_INTEGER+1}],["insufficient",{amountMinor:1001}],
 ["extra field",{approve:true}],["invalid month",{month:"2026-13"}],
] as const){
 test("refuses "+label+" before write",()=>fixture(async(store,path)=>{const bytes=await readFile(path);await assert.rejects(preview(store,{...request,...patch}));assert.deepEqual(await readFile(path),bytes);}));
}
test("unassigned legacy budgets are not silently assigned or created",()=>fixture(async(store,path)=>{
 await store.update(data=>{data.budgets=data.budgets.slice(0,2).map(({currency,...row})=>row);data.version=1;});
 const bytes=await readFile(path);await assert.rejects(preview(store,request),/existing explicitly/);assert.deepEqual(await readFile(path),bytes);
}));
test("overflowing total refuses even when each row individually fits",()=>fixture(async(store,path)=>{
 await store.update(data=>{data.budgets[0].limitMinor=Number.MAX_SAFE_INTEGER;data.budgets[1].limitMinor=1;});
 const bytes=await readFile(path);await assert.rejects(preview(store,{...request,amountMinor:1}),/combined/);assert.deepEqual(await readFile(path),bytes);
}));
test("tampered or structurally incomplete review cannot enter Store mutation",()=>fixture(async(store,path)=>{
 const review=await preview(store,request);const bytes=await readFile(path);
 const edits: Array<(r:any)=>void>=[
 r=>r.amountMinor++,r=>r.from.afterMinor++,r=>r.to.beforeMinor++,r=>r.from.category="else",
 r=>r.totalMinor++,r=>r.currency="usd",r=>r.schema="other",r=>r.reviewToken="0".repeat(64),
 r=>r.extra=true,r=>delete r.to.category,r=>r.to.extra=true,r=>r.from.beforeMinor=NaN,
 ];
 for(const edit of edits){const r=structuredClone(review);edit(r);await assert.rejects(commit(store,{review:r}));assert.deepEqual(await readFile(path),bytes);}
 await assert.rejects(commit(store,{review,extra:true}));
}));
test("reordered JSON keys carry the same reviewed meaning",()=>fixture(async(store)=>{
 const review=await preview(store,request);
 const reordered=Object.fromEntries(Object.entries(review).reverse());reordered.from=Object.fromEntries(Object.entries(review.from).reverse());
 assert.equal((await commit(store,{review:reordered})).status,"applied");
}));
