import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LedgerStore, monthlySummary, type LedgerData } from "../src/ledger.js";
import { previewBudgetRemoval, commitBudgetRemoval, validateBudgetRemovalPreview, budgetRemovalSelector } from "../src/budget-removal.js";
import { runBudgetRemoval, removalEndpoint } from "../src/budget-removal-client.js";

const selector = { category: "Obsolete", month: "2026-10", currency: "USD" };
function data(): LedgerData {
  return JSON.parse(JSON.stringify({version:2,transactions:[{id:"fixed",type:"expense",amountMinor:125,currency:"USD",date:"2026-10-01",category:"Obsolete",createdAt:"retained",extra:{marker:"transaction"}}],
    budgets:[{...selector,limitMinor:0,extra:{marker:"target"}},{...selector,currency:"EUR",limitMinor:500},{category:"Other",month:"2026-10",currency:"USD",limitMinor:750}],
    extra:{keep:["top-level"]}})) as LedgerData;
}
async function fixture(t: TestContext, value: unknown = data()) {
  const dir=await mkdtemp(join(tmpdir(),"budget-removal-"));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"ledger.json");
  if(value!==null) await writeFile(path,JSON.stringify(value,null,4)+"\n");
  return {path,store:new LedgerStore(path)};
}
const args=(token:string)=>({...selector,reviewToken:token});

test("preview retains complete literal target without writes; zero allowance removal is distinct",async t=>{
  const {path,store}=await fixture(t);
  const before=await readFile(path);const original=await store.load();
  const preview=await previewBudgetRemoval(store,{...selector,currency:" usd "});
  assert.deepEqual(preview.before,original.budgets[0]); assert.deepEqual(await readFile(path),before);
  const summaryBefore=monthlySummary(original,2026,10,"USD");
  assert.equal(summaryBefore.budgets.some(b=>b.category==="Obsolete"),true);
  const result=await commitBudgetRemoval(store,args(preview.reviewToken));
  assert.deepEqual(result.removed,original.budgets[0]); assert.equal(result.budgetCountAfter,2);
  const expected=structuredClone(original);expected.budgets.splice(0,1);
  assert.deepEqual(await store.load(),expected);
  assert.equal(monthlySummary(await store.load(),2026,10,"USD").budgets.some(b=>b.category==="Obsolete"),false);
  assert.deepEqual((await store.load()).transactions,original.transactions);
});
test("missing ledger preview refuses without creating storage",async t=>{
  const {path,store}=await fixture(t,null);
  await assert.rejects(previewBudgetRemoval(store,selector),/missing/);
  await assert.rejects(readFile(path),{code:"ENOENT"});
});
test("literal category whitespace is identity and retained spelling currency is normalized only for selection",async t=>{
  const d=data();d.budgets[0].category=" Obsolete ";d.budgets[0].currency=" usd ";
  const {store}=await fixture(t,d);
  await assert.rejects(previewBudgetRemoval(store,selector),/missing/);
  const exact={...selector,category:" Obsolete "};const p=await previewBudgetRemoval(store,exact);
  assert.equal(p.before.category," Obsolete ");assert.equal(p.before.currency," usd ");
  await commitBudgetRemoval(store,{...exact,reviewToken:p.reviewToken});
  assert.equal((await store.load()).budgets.length,2);
});
test("a selected known or unknown field edit invalidates review without another write",async t=>{
  for(const field of ["limitMinor","extra"]) {
    const {path,store}=await fixture(t);const p=await previewBudgetRemoval(store,selector);
    await store.update(d=>{(d.budgets[0] as unknown as Record<string,unknown>)[field]=field==="limitMinor"?1:{marker:"new"};});
    const before=await readFile(path);
    await assert.rejects(commitBudgetRemoval(store,args(p.reviewToken)),/changed/);
    assert.deepEqual(await readFile(path),before);
  }
});
test("unrelated fresh transactions, budgets and unknown fields survive",async t=>{
  const {store}=await fixture(t);const p=await previewBudgetRemoval(store,selector);
  await store.update(d=>{d.transactions[0].note="new unrelated note";d.budgets[2].limitMinor=999;(d as unknown as Record<string,unknown>).future="preserve";d.budgets.reverse();});
  const expected=await store.load();expected.budgets=expected.budgets.filter(b=>!(b.category==="Obsolete"&&b.currency==="USD"));
  await commitBudgetRemoval(store,args(p.reviewToken));assert.deepEqual(await store.load(),expected);
});
test("JSON object key reordering is benign while all unknown values bind",async t=>{
  const d=data();(d.budgets[0] as unknown as Record<string,unknown>).extra=JSON.parse('{"__proto__":{"x":1},"b":2,"a":3}');
  const {store}=await fixture(t,d);const p=await previewBudgetRemoval(store,selector);
  await store.update(x=>{(x.budgets[0] as unknown as Record<string,unknown>).extra=JSON.parse('{"a":3,"b":2,"__proto__":{"x":1}}');});
  await commitBudgetRemoval(store,args(p.reviewToken));assert.equal((await store.load()).budgets.length,2);
});
test("missing selected target, legacy and malformed duplicate state all refuse byte-exact",async t=>{
  for(const value of [{version:1,transactions:[],budgets:[{category:"Obsolete",month:"2026-10",limitMinor:5}]},
    {version:1,transactions:[],budgets:[{category:"Obsolete",month:"2026-10",limitMinor:5},{category:"Obsolete",month:"2026-10",limitMinor:8}]},
    {...data(),budgets:[data().budgets[0],data().budgets[0]]},
    {...data(),budgets:[]}]){
    const {path,store}=await fixture(t,value);const before=await readFile(path);
    await assert.rejects(previewBudgetRemoval(store,selector));assert.deepEqual(await readFile(path),before);
  }
});
test("selector and token admission rejects malformed or unsupported input before writes",async t=>{
  const {path,store}=await fixture(t);const before=await readFile(path);
  for(const input of [null,[],{}, {...selector,currency:null},{...selector,category:" "},{...selector,month:"2026-13"},{...selector,yes:true},Object.create(selector)]) {
    await assert.rejects(previewBudgetRemoval(store,input));
  }
  for(const token of ["", "a".repeat(63),"A".repeat(64),"f".repeat(64),null]) {
    await assert.rejects(commitBudgetRemoval(store,{...selector,reviewToken:token}));
  }
  assert.deepEqual(await readFile(path),before);
});
test("review snapshots detach and consumer validation refuses tampering",async t=>{
  const {store}=await fixture(t);const p=await previewBudgetRemoval(store,selector);
  const altered=structuredClone(p);altered.before.limitMinor=15;
  assert.throws(()=>validateBudgetRemovalPreview(altered,selector),/token/);
  assert.throws(()=>validateBudgetRemovalPreview(p,{...selector,currency:"EUR"}),/selector/);
  p.before.limitMinor=200;assert.equal((await store.load()).budgets[0].limitMinor,0);
});
test("large or deeply nested unknown values refuse read-only",async t=>{
  for(const extra of ["x".repeat(65536),Array.from({length:40}).reduce<unknown>(v=>[v],0)]){
    const d=data();(d.budgets[0] as unknown as Record<string,unknown>).extra=extra;
    const {store,path}=await fixture(t,d);const before=await readFile(path);
    await assert.rejects(previewBudgetRemoval(store,selector),/exceeds/);assert.deepEqual(await readFile(path),before);
  }
});
test("concurrent duplicate commands remove once, and replay after removal refuses",async t=>{
  const {store,path}=await fixture(t);const p=await previewBudgetRemoval(store,selector);
  const results=await Promise.allSettled([commitBudgetRemoval(store,args(p.reviewToken)),commitBudgetRemoval(new LedgerStore(path),args(p.reviewToken))]);
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);assert.equal(results.filter(x=>x.status==="rejected").length,1);
  const before=await readFile(path);await assert.rejects(commitBudgetRemoval(store,args(p.reviewToken)),/missing/);assert.deepEqual(await readFile(path),before);
});
test("save failure keeps source whole and releases unchanged Store queue",async t=>{
  const {store,path}=await fixture(t);const p=await previewBudgetRemoval(store,selector);const before=await readFile(path);
  class RefusingStore extends LedgerStore { override async save(_data:LedgerData):Promise<void>{throw new Error("authored save refusal");} }
  await assert.rejects(commitBudgetRemoval(new RefusingStore(path),args(p.reviewToken)),/save refusal/);
  assert.deepEqual(await readFile(path),before);await commitBudgetRemoval(store,args(p.reviewToken));assert.equal((await store.load()).budgets.length,2);
});
const reply=(value:unknown)=>({content:[{type:"text",text:JSON.stringify(value)}]});
test("consumer prints full review, escapes directional text and commits exactly once on exact confirmation",async t=>{
  const d=data();(d.budgets[0] as unknown as Record<string,unknown>).extra={literal:"\u001b[31m\u202e"};
  const {store}=await fixture(t,d);const p=await previewBudgetRemoval(store,selector);const calls:string[]=[];let output="";
  const result=await runBudgetRemoval(async(name,a)=>{calls.push(name);return reply(name==="preview_budget_removal"?await previewBudgetRemoval(store,a):await commitBudgetRemoval(store,a));},selector,
    {write:s=>{output+=s;},readLine:async()=>"REMOVE "+p.reviewToken});
  assert.equal(result.status,"removed");assert.deepEqual(calls,["preview_budget_removal","commit_budget_removal"]);
  assert.ok(output.includes("\\u001b[31m\\u202e"));assert.equal(output.includes("\u202e"),false);
});
test("cancel, EOF and nearly matching confirmation send no mutation",async t=>{
  const {store}=await fixture(t);const p=await previewBudgetRemoval(store,selector);
  for(const answer of [null,"","yes"," REMOVE "+p.reviewToken,"REMOVE "+p.reviewToken+" "]){
    const calls:string[]=[];const result=await runBudgetRemoval(async name=>{calls.push(name);return reply(p);},selector,{write:()=>{},readLine:async()=>answer});
    assert.equal(result.status,"cancelled");assert.deepEqual(calls,["preview_budget_removal"]);
  }
});
test("lost or invalid commit responses are unconfirmed and never retried",async t=>{
  const {store}=await fixture(t);const p=await previewBudgetRemoval(store,selector);
  for(const failure of ["throw","malformed","wrong-removed"]){
    let commits=0;await assert.rejects(runBudgetRemoval(async name=>{
      if(name==="preview_budget_removal")return reply(p);commits++;
      if(failure==="throw")throw new Error("lost after persistence");
      return failure==="malformed"?{}:reply({schema:p.schema,reviewToken:p.reviewToken,removed:{...p.before,limitMinor:5},budgetCountAfter:2});
    },selector,{write:()=>{},readLine:async()=>"REMOVE "+p.reviewToken}),/not confirmed/);assert.equal(commits,1);
  }
});
test("bad preview never asks for confirmation or mutation and endpoints are explicit loopback only",async t=>{
  const {store}=await fixture(t);const p=await previewBudgetRemoval(store,selector);
  for(const value of [{}, {isError:true,content:[{type:"text",text:"refused"}]},reply({...p,reviewToken:"f".repeat(64)})]){
    let reads=0;let calls=0;await assert.rejects(runBudgetRemoval(async()=>{calls++;return value;},selector,{write:()=>{},readLine:async()=>{reads++;return "yes";}}));
    assert.equal(reads,0);assert.equal(calls,1);
  }
  for(const url of ["https://127.0.0.1/mcp","http://example.com/mcp","http://127.0.0.1/mcp?q=1","http://user@localhost/mcp","http://localhost/other"])assert.throws(()=>removalEndpoint(url));
  for(const url of ["http://127.0.0.1:3456/mcp","http://localhost/mcp","http://[::1]:3456/mcp"])assert.equal(removalEndpoint(url).pathname,"/mcp");
  assert.deepEqual(budgetRemovalSelector({...selector,currency:" usd "}),selector);
});


test("non-finite numbers in any current unknown field refuse before JSON normalization",async t=>{
  for(const place of ["root","transaction","other-budget"]){
    const {path,store}=await fixture(t);
    const p=await previewBudgetRemoval(store,selector);
    const d=data() as unknown as Record<string,unknown>;
    const target=place==="root"?d:place==="transaction"?(d.transactions as Array<Record<string,unknown>>)[0]:(d.budgets as Array<Record<string,unknown>>)[2];
    target.overflow="NONFINITE_MARKER";
    const raw=JSON.stringify(d).replace('"NONFINITE_MARKER"',"1e400");
    await writeFile(path,raw);
    await assert.rejects(previewBudgetRemoval(store,selector),/non-finite/);
    await assert.rejects(commitBudgetRemoval(store,args(p.reviewToken)),/non-finite/);
    assert.equal(await readFile(path,"utf8"),raw);
  }
});

test("a caller cannot replace the reviewed token while commit waits behind another update",async t=>{
  const {store,path}=await fixture(t);const original=await previewBudgetRemoval(store,selector);
  const nextData=data();nextData.budgets[0].limitMinor=99;
  const future=await fixture(t,nextData);const fresh=await previewBudgetRemoval(future.store,selector);
  let release!:()=>void;let entered!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const started=new Promise<void>(resolve=>{entered=resolve;});
  const update=store.update(async d=>{d.budgets[0].limitMinor=99;entered();await held;});
  await started;
  const mutableArgs=args(original.reviewToken);
  const queued=commitBudgetRemoval(new LedgerStore(path),mutableArgs);
  const refused=assert.rejects(queued,/changed/);
  mutableArgs.reviewToken=fresh.reviewToken;
  release();await update;await refused;
  assert.deepEqual(await store.load(),nextData);
});
