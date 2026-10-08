import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { BudgetReallocationReview } from "../src/budget-reallocation.js";
type Reply = {isError?:boolean;content:Array<{type:string;text?:string}>};
function value<T>(raw:unknown):T{const r=raw as Reply;assert.equal(r.isError,undefined,JSON.stringify(r));return JSON.parse(r.content[0].text!) as T;}
function refused(raw:unknown,pattern:RegExp):void{const r=raw as Reply;assert.equal(r.isError,true);assert.match(r.content[0].text!,pattern);}
const request={month:"2026-10",currency:"USD",fromCategory:"food",toCategory:"travel",amountMinor:250};
async function launch(path: string): Promise<{ client: Client; stop: () => Promise<void> }> {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const address = probe.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))], {
    env: { ...process.env, HOUSEHOLD_LEDGER_DATA_PATH: path, HOUSEHOLD_LEDGER_HOST: "127.0.0.1", HOUSEHOLD_LEDGER_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let errors = "";
  child.stderr.on("data", chunk => { errors += String(chunk); });
  try {
    await new Promise<void>((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error(`private import server startup timed out: ${errors}`)), 5000);
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", code => { clearTimeout(timer); reject(new Error(`private import server exited ${code}: ${errors}`)); });
      child.stdout.on("data", chunk => {
        output += String(chunk);
        if (output.includes("listening on")) { clearTimeout(timer); resolve(); }
      });
    });
    assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
    const client = new Client({ name: "import-http-receiving", version: "1" }, { capabilities: {} });
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
    return { client, stop: async () => {
      await client.close();
      if (child.exitCode === null && child.signalCode === null) {
        const exit = once(child, "exit");
        child.kill("SIGTERM");
        await exit;
      }
      assert.equal(errors, "", `private import server errors: ${errors}`);
    } };
  } catch (error) {
    child.kill("SIGTERM");
    throw error;
  }
}

async function seed(client:Client):Promise<void>{
 for(const [category,limitMinor] of [["food",1000],["travel",500]] as const)
 value(await client.callTool({name:"set_budget",arguments:{category,limitMinor,month:"2026-10",currency:"USD"}}));
 value(await client.callTool({name:"record_transaction",arguments:{type:"expense",amountMinor:900,currency:"USD",date:"2026-10-05",category:"food",idempotencyKey:"receipt:one",note:"same receipt"}}));
}
test("actual HTTP review/commit reaches both budgets, summary/cashflow and fresh-process matching retry",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"hlm-reallocation-http-")),path=join(dir,"ledger.json");let service:Awaited<ReturnType<typeof launch>>|undefined;
 try{
  service=await launch(path);await seed(service.client);
  const tools=(await service.client.listTools()).tools;
  for(const name of ["preview_budget_reallocation","commit_budget_reallocation"])assert.equal(tools.filter(t=>t.name===name).length,1);
  const before=await readFile(path,"utf8");
  const review=value<BudgetReallocationReview>(await service.client.callTool({name:"preview_budget_reallocation",arguments:request}));
  assert.equal(await readFile(path,"utf8"),before);
  value(await service.client.callTool({name:"record_transaction",arguments:{type:"income",amountMinor:2000,currency:"USD",date:"2026-10-06",category:"salary",idempotencyKey:"newer"}}));
  const fresh=JSON.parse(await readFile(path,"utf8"));
  const result=value<{status:string}>(await service.client.callTool({name:"commit_budget_reallocation",arguments:{review}}));
  assert.equal(result.status,"applied");const after=JSON.parse(await readFile(path,"utf8"));assert.deepEqual(after.transactions,fresh.transactions);
  assert.deepEqual(after.budgets.map((b:any)=>b.limitMinor),[750,750]);
  const summary=value<any>(await service.client.callTool({name:"monthly_summary",arguments:{year:2026,month:10,currency:"USD"}}));
  assert.equal(summary.expenseMinor,900);assert.equal(summary.incomeMinor,2000);assert.deepEqual(summary.budgets.map((b:any)=>[b.category,b.remainingMinor,b.over]),[["food",-150,true],["travel",750,false]]);
  const trend=value<any>(await service.client.callTool({name:"cashflow_trend",arguments:{fromMonth:"2026-10",toMonth:"2026-10",currency:"USD"}}));
  assert.deepEqual(trend.months[0].budgets,summary.budgets);assert.equal(trend.totals.netMinor,1100);
  const bytes=await readFile(path);const modified=(await stat(path)).mtimeMs;
  await service.stop();service=await launch(path);
  assert.equal(value<{status:string}>(await service.client.callTool({name:"commit_budget_reallocation",arguments:{review}})).status,"already_matching");
  assert.deepEqual(await readFile(path),bytes);assert.equal((await stat(path)).mtimeMs,modified);
  const retry=value<any>(await service.client.callTool({name:"record_transaction",arguments:{type:"expense",amountMinor:900,currency:"USD",date:"2026-10-05",category:"food",idempotencyKey:"receipt:one",note:"same receipt"}}));
  assert.deepEqual(retry,after.transactions[0]);assert.deepEqual(await readFile(path),bytes);
 }finally{if(service)await service.stop();await rm(dir,{recursive:true,force:true});}
});
test("actual HTTP stale pair, tampered review and extra arguments refuse; fresh review works",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"hlm-reallocation-http-")),path=join(dir,"ledger.json");let service:Awaited<ReturnType<typeof launch>>|undefined;
 try{
  service=await launch(path);await seed(service.client);const client=service.client;
  const review=value<BudgetReallocationReview>(await client.callTool({name:"preview_budget_reallocation",arguments:request}));
  value(await client.callTool({name:"set_budget",arguments:{category:"travel",month:"2026-10",currency:"USD",limitMinor:600}}));
  const bytes=await readFile(path);
  refused(await client.callTool({name:"commit_budget_reallocation",arguments:{review}}),/changed/);
  refused(await client.callTool({name:"commit_budget_reallocation",arguments:{review:{...review,totalMinor:1499}}}),/review content/);
  refused(await client.callTool({name:"preview_budget_reallocation",arguments:{...request,overwrite:true}}),/unsupported/);
  assert.deepEqual(await readFile(path),bytes);
  const fresh=value<BudgetReallocationReview>(await client.callTool({name:"preview_budget_reallocation",arguments:request}));
  assert.equal(value<{status:string}>(await client.callTool({name:"commit_budget_reallocation",arguments:{review:fresh}})).status,"applied");
  assert.deepEqual(JSON.parse(await readFile(path,"utf8")).budgets.map((b:any)=>b.limitMinor),[750,850]);
 }finally{if(service)await service.stop();await rm(dir,{recursive:true,force:true});}
});
