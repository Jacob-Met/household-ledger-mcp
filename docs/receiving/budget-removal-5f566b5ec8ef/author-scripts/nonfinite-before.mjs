import { writeFile, readFile, mkdir } from "node:fs/promises";
import { LedgerStore } from "./source/dist/src/ledger.js";
import { previewBudgetRemoval, commitBudgetRemoval } from "./source/dist/src/budget-removal.js";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const dir=new URL("./evidence/nonfinite-before/",import.meta.url);await mkdir(dir);
const path=fileURLToPath(new URL("ledger.json",dir));
const text='{"version":2,"transactions":[],"budgets":[{"category":"Old","month":"2026-10","currency":"USD","limitMinor":1}],"unknown":1e400}\n';
await writeFile(path,text);const store=new LedgerStore(path);const selector={category:"Old",month:"2026-10",currency:"USD"};
const p=await previewBudgetRemoval(store,selector);let error=null;
try{await commitBudgetRemoval(store,{...selector,reviewToken:p.reviewToken});}catch(e){error=String(e);}
const after=await readFile(path,"utf8");const receipt={candidate:"27b53168",error,unknownBefore:(await import("node:util")).inspect(JSON.parse(text).unknown),unknownAfter:(await import("node:util")).inspect(JSON.parse(after).unknown),preserved:after===text};
console.log(JSON.stringify(receipt));await writeFile(new URL("receipt.json",dir),JSON.stringify(receipt,null,2)+"\n");
assert.equal(receipt.preserved,true,"unrelated nonfinite parsed JSON value must not be normalized by removal");
