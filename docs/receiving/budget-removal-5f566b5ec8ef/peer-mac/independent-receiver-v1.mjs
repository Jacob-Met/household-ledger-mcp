import assert from "node:assert/strict";
import {promises as fs} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {pathToFileURL} from "node:url";
const owner="D:/HAMON/household-budget-removal-5f566b5ec8ef/source";
const root="D:/HAMON/household-budget-removal-peer-mac-5f566b5ec8ef/receiver-v1";
await fs.mkdir(root);
const sourcePaths=["src/ledger.ts","src/budget-removal.ts","src/budget-removal-client.ts","dist/src/ledger.js","dist/src/budget-removal.js","dist/src/budget-removal-client.js"];
async function pins(){return Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,createHash("sha256").update(await fs.readFile(join(owner,p))).digest("hex")])));}
const beforePins=await pins();assert.equal(beforePins["src/budget-removal.ts"],"84b2e89ac2d9a7016d4a993a90254d0a1dae02ec6e5b5b00e3a8380a9909434b");
const {LedgerStore}=await import(pathToFileURL(join(owner,"dist/src/ledger.js")));
const {previewBudgetRemoval:preview,commitBudgetRemoval:commit}=await import(pathToFileURL(join(owner,"dist/src/budget-removal.js")));
const {runBudgetRemoval}=await import(pathToFileURL(join(owner,"dist/src/budget-removal-client.js")));
const selector={category:"  Travel 旅行\nA  ",month:"2026-10",currency:" usd "};
function fixture(){
 const target=JSON.parse('{"category":"  Travel 旅行\\nA  ","month":"2026-10","currency":" usd ","limitMinor":0,"__proto__":{"literal":true},"constructor":"literal-key","extra":{"z":[1,{"q":null}],"a":false}}');
 return {version:2,transactions:[{id:"existing",type:"expense",amountMinor:19,currency:"USD",date:"2026-10-02",category:"Different",createdAt:"literal",extra:{keep:true}}],
  budgets:[{category:"Other",month:"2026-09",currency:"CHF",limitMinor:7,unowned:[3,2]},target,{category:target.category,month:"2026-10",currency:"EUR",limitMinor:5}],
  rootUnknown:{ordering:["keep",null,1]}};
}
let count=0;const checks=[];
async function make(data=fixture()){const path=join(root,"ledger-"+(++count)+".json");await fs.writeFile(path,JSON.stringify(data,null,2)+"\n",{flag:"wx"});return {path,store:new LedgerStore(path),data};}
const reply=x=>({content:[{type:"text",text:JSON.stringify(x)}]});
async function check(name,fn){try{const detail=await fn();checks.push({name,passed:true,...detail});console.log("PASS "+name);}catch(e){checks.push({name,passed:false,error:String(e)});console.log("FAIL "+name+": "+e);}}
await check("Exact literal category, normalized explicit currency and complete unknown own keys",async()=>{
 const x=await make();const p=await preview(x.store,selector);assert.deepEqual(p.before,x.data.budgets[1]);assert.equal(Object.hasOwn(p.before,"__proto__"),true);assert.equal(p.selector.category,selector.category);assert.equal(p.selector.currency,"USD");
 await assert.rejects(preview(x.store,{...selector,category:selector.category.trim()}));
 return {reviewToken:p.reviewToken,unknownOwnKeys:Object.keys(p.before)};
});
await check("Fresh unrelated insertion and object-key order changes preserve identity and remove current occurrence",async()=>{
 const x=await make();const p=await preview(x.store,selector);const changed=structuredClone(x.data);changed.budgets[1]=Object.fromEntries(Object.entries(changed.budgets[1]).reverse());changed.budgets[1].extra={a:false,z:[1,{q:null}]};
 changed.budgets.unshift({category:"New unrelated",month:"2026-10",currency:"CAD",limitMinor:4});changed.transactions.push({...changed.transactions[0],id:"later",amountMinor:31});changed.rootUnknown.latest="keep latest";await fs.writeFile(x.path,JSON.stringify(changed,null,3)+"\n");
 const current=await preview(x.store,selector);assert.equal(current.reviewToken,p.reviewToken);const r=await commit(x.store,{...selector,reviewToken:p.reviewToken});const actual=JSON.parse(await fs.readFile(x.path,"utf8"));const expected=structuredClone(changed);expected.budgets.splice(2,1);assert.deepEqual(actual,expected);assert.equal(r.budgetCountAfter,3);
});
await check("Target nested array-order change refuses with literal current file bytes intact",async()=>{
 const x=await make();const p=await preview(x.store,selector);x.data.budgets[1].extra.z.reverse();await fs.writeFile(x.path,JSON.stringify(x.data,null,4)+"\n");const bytes=await fs.readFile(x.path);await assert.rejects(commit(x.store,{...selector,reviewToken:p.reviewToken}),/changed/);assert.deepEqual(await fs.readFile(x.path),bytes);
});
await check("Preview copy mutation leaves saved target intact and cannot alter commit result",async()=>{
 const x=await make();const p=await preview(x.store,selector);p.before.extra.z[1].q="client changed";p.before["__proto__"].literal=false;const r=await commit(x.store,{...selector,reviewToken:p.reviewToken});assert.deepEqual(r.removed,x.data.budgets[1]);assert.deepEqual((await x.store.load()).transactions,x.data.transactions);
});
await check("Malformed preview binding is refused before prompt or commit",async()=>{
 const x=await make();const p=await preview(x.store,selector);p.before.limitMinor=2;const calls=[];let prompts=0;
 await assert.rejects(runBudgetRemoval(async(name,args)=>{calls.push(name);return reply(p);},selector,{write(){},async readLine(){prompts++;return "REMOVE "+p.reviewToken;}}),/token/);assert.deepEqual(calls,["preview_budget_removal"]);assert.equal(prompts,0);
});
await check("Mismatched unknown content in commit receipt is unconfirmed after exactly one request",async()=>{
 const x=await make();const p=await preview(x.store,selector);const calls=[];let output="";
 await assert.rejects(runBudgetRemoval(async(name,args)=>{calls.push(name);if(name==="preview_budget_removal")return reply(p);const bad=structuredClone(p.before);bad.extra.a=true;return reply({schema:p.schema,reviewToken:p.reviewToken,removed:bad,budgetCountAfter:2});},selector,{write(x){output+=x;},async readLine(){return "REMOVE "+p.reviewToken;}}),/not confirmed/);assert.deepEqual(calls,["preview_budget_removal","commit_budget_removal"]);assert(!output.includes("Server confirmed removal"));assert(!output.includes("\u001b"));
});
await check("Held same-process Store update is fresh-read and unrelated state survives",async()=>{
 const x=await make();const p=await preview(x.store,selector);let release,entered;const gate=new Promise(r=>release=r);const ready=new Promise(r=>entered=r);
 const held=x.store.update(async data=>{entered();await gate;data.rootUnknown.queued="preserved";data.budgets.unshift({category:"Queued",month:"2026-09",currency:"JPY",limitMinor:17});});await ready;
 const pending=commit(new LedgerStore(x.path),{...selector,reviewToken:p.reviewToken});release();await held;await pending;
 const actual=await x.store.load();assert.equal(actual.rootUnknown.queued,"preserved");assert.equal(actual.budgets[0].category,"Queued");assert.equal(actual.budgets.length,3);
});
await check("Queued commit retains the token passed at invocation despite caller argument mutation",async()=>{
 const x=await make();const p=await preview(x.store,selector);const next=fixture();next.budgets[1].limitMinor=99;const future=await make(next);const fresh=await preview(future.store,selector);
 let release,entered;const gate=new Promise(r=>release=r);const ready=new Promise(r=>entered=r);
 const held=x.store.update(async data=>{entered();await gate;data.budgets[1].limitMinor=99;});await ready;
 const args={...selector,reviewToken:p.reviewToken};const pending=commit(new LedgerStore(x.path),args);args.reviewToken=fresh.reviewToken;release();await held;
 let outcome;try{outcome={status:"fulfilled",value:await pending};}catch(e){outcome={status:"rejected",error:String(e)};}
 const actual=await x.store.load();await fs.writeFile(join(root,"queued-argument-outcome.json"),JSON.stringify({originalToken:p.reviewToken,mutatedToken:fresh.reviewToken,outcome,actual},null,2));
 assert.equal(outcome.status,"rejected","Commit borrowed the later mutated token and removed a target changed after invocation");assert.equal(actual.budgets[1].limitMinor,99);
});
const afterPins=await pins();assert.deepEqual(afterPins,beforePins);
const result={node:process.version,checks,passed:checks.filter(x=>x.passed).length,total:checks.length,sourceAndModulesBefore:beforePins,sourceAndModulesUnchanged:true,boundary:"Independent private native fixtures and injected protocol replies; no owner suite, real ledger or provider action."};
await fs.writeFile(join(root,"result.json"),JSON.stringify(result,null,2)+"\n");
process.exitCode=checks.every(x=>x.passed)?0:1;
