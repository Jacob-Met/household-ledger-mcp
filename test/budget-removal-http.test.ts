import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as netServer } from "node:net";
import { createServer as httpServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LedgerStore } from "../src/ledger.js";
import type { BudgetRemovalPreview } from "../src/budget-removal.js";
const selector={category:' Old "plan" \n北 ',month:"2026-10",currency:"USD"};
const initial={version:2,transactions:[{id:"source",type:"expense",amountMinor:10,currency:"USD",date:"2026-10-01",category:"other",createdAt:"exact",extra:"keep"}],
  budgets:[{...selector,limitMinor:200,extra:{note:"exact target"}},{category:"other",month:"2026-10",currency:"USD",limitMinor:500}],extra:["retain"]};
function payload<T>(reply:unknown):T {
  const r=reply as {isError?:boolean,content:Array<{text:string}>};assert.notEqual(r.isError,true,JSON.stringify(r));return JSON.parse(r.content[0].text) as T;
}
async function launch(t:TestContext) {
  const dir=await mkdtemp(join(tmpdir(),"budget-removal-http-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"ledger.json");await writeFile(path,JSON.stringify(initial,null,4)+"\n");
  const probe=netServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const a=probe.address();assert.ok(a&&typeof a!=="string");
  const port=a.port;await new Promise<void>(resolve=>probe.close(()=>resolve()));
  // Existing Windows direct-entry guard is not repaired by this contribution.
  // Call the actual exported main in an isolated child for cross-platform receiving.
  const code="import { main } from "+JSON.stringify(new URL("../src/index.js",import.meta.url).href)+"; await main();";
  const child=spawn(process.execPath,["--input-type=module","--eval",code],
    {env:{...process.env,HOUSEHOLD_LEDGER_HOST:"127.0.0.1",HOUSEHOLD_LEDGER_PORT:String(port),HOUSEHOLD_LEDGER_DATA_PATH:path},stdio:["pipe","pipe","pipe"]});
  let errors="";child.stderr.on("data",x=>{errors+=x;});
  t.after(async()=>{if(child.exitCode===null){const done=once(child,"exit");child.kill();await done;}});
  await new Promise<void>((resolve,reject)=>{
    let out="";const timer=setTimeout(()=>reject(new Error("private server did not start: "+errors)),10000);
    child.once("error",e=>{clearTimeout(timer);reject(e);});child.once("exit",c=>{clearTimeout(timer);reject(new Error("server exited "+c+": "+errors));});
    child.stdout.on("data",x=>{out+=x;if(out.includes("listening on")){clearTimeout(timer);resolve();}});
  });
  const url="http://127.0.0.1:"+port+"/mcp";const client=new Client({name:"budget-removal-http-receiver",version:"1"},{capabilities:{}});
  await client.connect(new StreamableHTTPClientTransport(new URL(url)));t.after(()=>client.close());
  return {path,dir,url,client,store:new LedgerStore(path)};
}
async function cli(url:string,answer:(token:string)=>Promise<string|null>):Promise<{code:number|null;stdout:string;stderr:string}> {
  const child=spawn(process.execPath,[fileURLToPath(new URL("../src/household-remove-budget.js",import.meta.url)),"--url",url,"--category",selector.category,"--month",selector.month,"--currency",selector.currency],{stdio:["pipe","pipe","pipe"]});
  let stdout="",stderr="",sent=false;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{child.kill();reject(new Error("CLI timeout: "+stdout+" / "+stderr));},15000);
    child.stderr.on("data",x=>{stderr+=x;});
    child.stdout.on("data",x=>{
      stdout+=x;const match=stdout.match(/Type exactly REMOVE ([a-f0-9]{64}) to remove it/);
      if(match&&!sent){sent=true;answer(match[1]).then(value=>child.stdin.end(value===null?undefined:value+"\n"),error=>{child.kill();clearTimeout(timer);reject(error);});}
    });
    child.once("error",e=>{clearTimeout(timer);reject(e);});
    child.once("exit",code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
  });
}
test("actual HTTP advertises precise hints, previews without writes, commits one target and refuses stale replay",async t=>{
  const {path,client,store}=await launch(t);const before=await readFile(path);const defs=(await client.listTools()).tools;
  assert.equal(defs.find(x=>x.name==="preview_budget_removal")?.annotations?.readOnlyHint,true);
  assert.equal(defs.find(x=>x.name==="commit_budget_removal")?.annotations?.destructiveHint,true);
  const p=payload<BudgetRemovalPreview>(await client.callTool({name:"preview_budget_removal",arguments:selector}));
  assert.deepEqual(p.before,initial.budgets[0]);assert.deepEqual(await readFile(path),before);
  const result=payload<{removed:unknown}>(await client.callTool({name:"commit_budget_removal",arguments:{...selector,reviewToken:p.reviewToken}}));
  assert.deepEqual(result.removed,initial.budgets[0]);
  assert.deepEqual(await store.load(),{...initial,budgets:[initial.budgets[1]]});
  const after=await readFile(path);const replay=await client.callTool({name:"commit_budget_removal",arguments:{...selector,reviewToken:p.reviewToken}});
  assert.equal(replay.isError,true);assert.deepEqual(await readFile(path),after);
});
test("actual terminal cancel and EOF preserve exact bytes; explicit digest removes only one allowance",async t=>{
  const {path,url,store}=await launch(t);const before=await readFile(path);
  for(const answer of [null,"cancel"]){
    const r=await cli(url,async()=>answer);assert.equal(r.code,2,r.stderr);assert.match(r.stdout,/No removal request/);assert.deepEqual(await readFile(path),before);
  }
  const r=await cli(url,async token=>"REMOVE "+token);
  assert.equal(r.code,0,r.stderr);assert.match(r.stdout,/Server confirmed removal/);
  assert.ok(r.stdout.includes(JSON.stringify(selector.category)));
  assert.deepEqual(await store.load(),{...initial,budgets:[initial.budgets[1]]});
});
test("actual terminal review refuses a changed target and keeps concurrent unrelated values",async t=>{
  const {url,store}=await launch(t);
  const r=await cli(url,async token=>{
    await store.update(d=>{d.budgets[0].limitMinor=300;d.transactions[0].note="fresh current";});return "REMOVE "+token;
  });
  assert.equal(r.code,1);assert.match(r.stderr,/not confirmed/);
  assert.equal((await store.load()).budgets[0].limitMinor,300);assert.equal((await store.load()).transactions[0].note,"fresh current");
});
test("actual terminal removes reviewed target while retaining an unrelated intervening write",async t=>{
  const {url,store}=await launch(t);
  const r=await cli(url,async token=>{await store.update(d=>{d.budgets[1].limitMinor=900;d.transactions[0].note="concurrent";});return "REMOVE "+token;});
  assert.equal(r.code,0,r.stderr);const d=await store.load();assert.equal(d.budgets.length,1);assert.equal(d.budgets[0].limitMinor,900);assert.equal(d.transactions[0].note,"concurrent");
});
test("actual response loss after persistence yields unconfirmed exit and exactly one mutation request",async t=>{
  const {url,store}=await launch(t);let commits=0;
  const proxy=httpServer(async(req,res)=>{
    try {
      const chunks:Buffer[]=[];for await(const c of req)chunks.push(c as Buffer);const body=Buffer.concat(chunks);
      const parsed=body.length?JSON.parse(body.toString()):{};
      const isCommit=parsed.method==="tools/call"&&parsed.params?.name==="commit_budget_removal";
      if(isCommit)commits++;
      const upstream=await fetch(url,{method:req.method,headers:{"content-type":"application/json",accept:"application/json, text/event-stream"},...(body.length?{body}:{}),redirect:"error"});
      const bytes=Buffer.from(await upstream.arrayBuffer());
      if(isCommit){res.destroy();return;}
      res.writeHead(upstream.status,{"content-type":upstream.headers.get("content-type")??"application/json"});res.end(bytes);
    }catch(error){if(!res.destroyed){res.writeHead(500);res.end(String(error));}}
  });
  proxy.listen(0,"127.0.0.1");await once(proxy,"listening");t.after(()=>new Promise<void>(resolve=>{proxy.closeAllConnections();proxy.close(()=>resolve());}));
  const a=proxy.address();assert.ok(a&&typeof a!=="string");
  const r=await cli("http://127.0.0.1:"+a.port+"/mcp",async token=>"REMOVE "+token);
  assert.equal(r.code,1);assert.match(r.stderr,/not confirmed/);assert.equal(commits,1);
  assert.deepEqual(await store.load(),{...initial,budgets:[initial.budgets[1]]});
});
