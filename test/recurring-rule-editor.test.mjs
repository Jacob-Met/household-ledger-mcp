import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BYTES, validateDocument, encodeRules, decodeRules, replaceRule, removeRule, moveRule, parsePositiveInteger } from '../web/recurring-rule-editor/model.mjs';
const bytes = text => new TextEncoder().encode(text);
const text = value => new TextDecoder().decode(value);
const document = () => ({schema:'household-recurring-expenses/1',currency:' usd ',rules:[
 {id:'rent-α',start:'2026-01-31',category:' Home ',amountMinor:125000,repeat:{unit:'month',every:1,missingDay:'last'}},
 {id:'food-β',start:'2026-10-05',end:'2026-11-30',category:'Food',amountMinor:3450,note:'first\r\nsecond\rthird\n',repeat:{unit:'week',every:2}}
]});
test('complete canonical document and deterministic exact bytes are detached',()=>{
 const raw=document(),before=JSON.stringify(raw),canonical=encodeRules(raw);
 assert.equal(text(canonical),JSON.stringify(raw,null,2)+'\n');
 assert.deepEqual(decodeRules(canonical),raw);assert.deepEqual(encodeRules(raw),canonical);
 const reversed={rules:raw.rules.map(r=>Object.fromEntries(Object.entries(r).reverse())),currency:raw.currency,schema:raw.schema};
 assert.deepEqual(encodeRules(reversed),canonical);
 const admitted=validateDocument(raw);assert.notEqual(admitted,raw);assert.notEqual(admitted.rules,raw.rules);
 assert.notEqual(admitted.rules[0].repeat,raw.rules[0].repeat);admitted.rules[0].repeat.every=2;
 assert.equal(JSON.stringify(raw),before);
});
test('literal controls, Unicode identity and optional empty notes survive',()=>{
 const d=document();d.rules[0].id='é';d.rules[1].id='e\u0301';
 d.rules[0].category=' X\r\nY ';d.rules[0].note='\0\r\n\r\n\ud800<svg onload="x">𐐷';d.rules[1].note='';
 const result=decodeRules(encodeRules(d));assert.deepEqual(result,d);assert.equal(result.rules[0].note.charCodeAt(5),0xd800);
 delete d.rules[1].note;assert.ok(!Object.hasOwn(decodeRules(encodeRules(d)).rules[1],'note'));
 d.rules[0].id='x\u0085y';assert.equal(validateDocument(d).rules[0].id,'x\u0085y');
});
test('strict raw UTF8, BOM, duplicate fields, JSON depth and trailing text',()=>{
 const raw=encodeRules(document());assert.deepEqual(decodeRules(new Uint8Array([239,187,191,...raw])),document());
 for(const input of [new Uint8Array([0xff]),new Uint8Array([239,187,191,239,187,191,...raw]),
 bytes('{"schema":"household-recurring-expenses/1","currency":"USD","currency":"EUR","rules":[]}'),
 bytes('{"schema":"household-recurring-expenses/1","currency":"USD","rules":[],"\\u0072ules":[]}'),
 bytes('['.repeat(10)+'0'+']'.repeat(10)),bytes('null'),bytes(text(raw)+' true'),
 bytes('{"schema":"household-recurring-expenses/1","currency":"USD","rules":[]}x')])assert.throws(()=>decodeRules(input));
});
test('native structural, date, interval and identity boundaries',()=>{
 const mutations=[
 d=>d.rules.push({...d.rules[0]}),d=>d.rules[0].id=' x ',d=>d.rules[0].id='x\0',d=>d.rules[0].id='\ud800',
 d=>d.rules[0].start='1969-12-31',d=>d.rules[0].start='2025-02-29',d=>d.rules[0].end='2025-12-31',
 d=>d.rules[0].repeat.missingDay='nearest',d=>delete d.rules[0].repeat.missingDay,
 d=>d.rules[1].repeat.missingDay='skip',d=>d.rules[1].repeat.every=53,d=>d.rules[0].repeat.every=121,
 d=>d.rules[0].category=' \n ',d=>d.currency='USDD',d=>d.rules[0].note=null,
 d=>d.unknown=true,d=>d.rules[0].unknown=true,d=>d.rules[0].repeat.unknown=true
 ];for(const mutate of mutations){const d=document();mutate(d);assert.throws(()=>validateDocument(d));}
 const d=document();d.rules[0].start='2024-02-29';d.rules[0].repeat.every=120;d.rules[1].repeat.every=52;
 assert.deepEqual(validateDocument(d),d);
});
test('integer amounts and explicit decimal form input do not round',()=>{
 for(const amount of [0,-0,-1,1.5,NaN,Infinity,9007199254740992,'1']){const d=document();d.rules[0].amountMinor=amount;assert.throws(()=>validateDocument(d));}
 const d=document();d.rules[0].amountMinor=Number.MAX_SAFE_INTEGER;assert.equal(decodeRules(encodeRules(d)).rules[0].amountMinor,9007199254740991);
 assert.equal(parsePositiveInteger('9007199254740991',Number.MAX_SAFE_INTEGER),9007199254740991);
 for(const v of ['0','01','1.0','1e2','+1',' 1','1 ','9007199254740992'])assert.throws(()=>parsePositiveInteger(v,Number.MAX_SAFE_INTEGER));
});
test('all editing operations preserve old document and distinct equal rules',()=>{
 const d=document(),before=JSON.stringify(d),r={...d.rules[0],id:'another'};
 const three=replaceRule(d,null,r);assert.equal(three.rules.length,3);assert.equal(JSON.stringify(d),before);
 assert.deepEqual(moveRule(three,2,-1).rules.map(r=>r.id),['rent-α','another','food-β']);
 assert.deepEqual(removeRule(three,1).rules.map(r=>r.id),['rent-α','another']);
 assert.equal(replaceRule(d,1,{...d.rules[1],amountMinor:987}).rules[1].amountMinor,987);
 for(const index of [-1,2,1.5,'0',null])assert.throws(()=>removeRule(d,index));
 assert.throws(()=>moveRule(d,0,-1));assert.throws(()=>moveRule(d,1,1));assert.throws(()=>moveRule(d,0,2));
 assert.equal(JSON.stringify(d),before);
});
test('100 rules, exact source byte cap and complete output bound',()=>{
 const d=document();d.rules=Array.from({length:100},(_,i)=>({...d.rules[0],id:'r'+i}));
 assert.equal(validateDocument(d).rules.length,100);d.rules.push({...d.rules[0],id:'r100'});assert.throws(()=>validateDocument(d));
 const raw=encodeRules({schema:'household-recurring-expenses/1',currency:'USD',rules:[]});
 const exact=new Uint8Array(MAX_BYTES);exact.fill(32);exact.set(raw);assert.equal(decodeRules(exact).rules.length,0);
 const over=new Uint8Array(MAX_BYTES+1);over.fill(32);over.set(raw);assert.throws(()=>decodeRules(over));
 const large=document();large.rules[0].note='x'.repeat(MAX_BYTES);assert.throws(()=>encodeRules(large));
});
test('special arrays and accessors are refused without running value getters',()=>{
 let invoked=0;const d=document();Object.defineProperty(d.rules[0],'note',{enumerable:true,get(){invoked++;return 'bad';}});
 assert.throws(()=>validateDocument(d));assert.equal(invoked,0);
 const sparse=document();delete sparse.rules[0];assert.throws(()=>validateDocument(sparse));
 const extra=document();extra.rules.extra=1;assert.throws(()=>validateDocument(extra));
 const inherited=document();Object.setPrototypeOf(inherited.rules[0],{bad:true});assert.throws(()=>validateDocument(inherited));
});
