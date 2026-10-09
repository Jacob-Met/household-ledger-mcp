// Independent native receiver transport. Adapted from the accepted RecallWeave
// tools/check_browser.mjs at d8a9ff81. Uses an isolated headless Chrome profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(check,label,milliseconds=12000){
  const end=Date.now()+milliseconds;let last;
  while(Date.now()<end){try{const value=await check();if(value)return value;}catch(error){last=error;}await pause(100);}
  throw new Error('Timed out: '+label+(last?' ('+last.message+')':''));
}
export async function openBrowser(output,executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'){
  output=resolve(output);await mkdir(output,{recursive:true});
  const profile=await mkdtemp(join(output,'profile-'));
  const downloads=join(output,'downloads');await mkdir(downloads,{recursive:true});
  const child=spawn(executable,['--headless=new','--disable-gpu','--disable-background-networking',
    '--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
    {stdio:['ignore','ignore','pipe']});
  let log='',launchError,socket,sessionId,sequence=0;
  const pending=new Map(),events=[],errors=[],requests=[],downloadsStarted=[],downloadsCompleted=new Map();
  child.stderr.on('data',bytes=>{log=(log+bytes.toString()).slice(-12000);});
  child.on('error',error=>{launchError=error;});
  function command(method,params={},scoped=true){
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timeout: '+method));},45000);
      pending.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params,...(scoped&&sessionId?{sessionId}:{})}));
    });
  }
  async function evaluate(expression){
    const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);
    return r.result.value;
  }
  async function key(name){
    const codes={Enter:13,Tab:9,Home:36,End:35,ArrowRight:39,ArrowLeft:37,ArrowUp:38,ArrowDown:40};
    for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{
      type,key:name,code:name,windowsVirtualKeyCode:codes[name]??0,nativeVirtualKeyCode:codes[name]??0,
      ...(name==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})
    });
  }
  async function activate(selector){
    assert.ok(await evaluate('!!document.querySelector('+JSON.stringify(selector)+')'),'missing '+selector);
    await evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');await key('Enter');
  }
  async function close(){
    if(socket?.readyState===1){try{await command('Browser.close',{},false);}catch{}socket.close();}
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('browser closed'));}pending.clear();
    const alive=()=>child.exitCode===null&&child.signalCode===null;
    const waitExit=async milliseconds=>{if(alive())await Promise.race([new Promise(r=>child.once('exit',r)),pause(milliseconds)]);};
    await waitExit(2000);
    if(alive()){child.kill('SIGTERM');await waitExit(5000);}
    if(alive()){child.kill('SIGKILL');await waitExit(5000);}
    await writeFile(join(output,'browser-stderr.log'),log);
    if(alive())throw new Error('Owned browser did not exit; profile preserved for inspection.');
    await rm(profile,{recursive:true,force:true});
  }
  try{
    const [port,endpoint]=await until(async()=>{
      if(launchError)throw launchError;
      if(child.exitCode!==null)throw new Error('browser exited '+child.exitCode+': '+log);
      const fields=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
      return fields[0]&&fields[1]?fields:false;
    },'Chrome startup',90000);
    socket=new WebSocket('ws://127.0.0.1:'+port+endpoint);
    socket.addEventListener('message',event=>{
      const m=JSON.parse(event.data);
      if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);
        if(m.error)p.reject(new Error(m.error.message));else p.resolve(m.result);return;}
      events.push(m);
      if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description??m.params.exceptionDetails.text);
      if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);
      if(m.method==='Browser.downloadWillBegin')downloadsStarted.push(m.params);
      if(m.method==='Browser.downloadProgress')downloadsCompleted.set(m.params.guid,m.params);
    });
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    const version=await command('Browser.getVersion',{},false);
    const {targetId}=await command('Target.createTarget',{url:'about:blank'},false);
    ({sessionId}=await command('Target.attachToTarget',{targetId,flatten:true},false));
    await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
    await command('Browser.setDownloadBehavior',{behavior:'allowAndName',downloadPath:downloads,eventsEnabled:true},false);
    await command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
    return {version,childPid:child.pid,profile,command,evaluate,key,activate,close,errors,requests,events,
      async viewport(width,height=1000){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});},
      async navigate(path,width=1280,height=1000){
        errors.length=0;requests.length=0;
        await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        const url=pathToFileURL(resolve(path)).href;await command('Page.navigate',{url});
        await until(()=>evaluate('document.URL === '+JSON.stringify(url)+' && document.readyState === "complete"'),'report document load');
      },
      async screenshot(name){
        await evaluate('window.scrollTo(0,0); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const {cssContentSize:s}=await command('Page.getLayoutMetrics');
        const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,
          clip:{x:0,y:0,width:s.width,height:Math.min(s.height,7000),scale:1}});
        const bytes=Buffer.from(data,'base64');const path=join(output,name);await writeFile(path,bytes);
        return {path,sha256:sha256(bytes),bytes:bytes.length};
      },
      async download(selector){
        const count=downloadsStarted.length;await activate(selector);
        const start=await until(()=>downloadsStarted[count],'download start');
        const completed=await until(()=>{const p=downloadsCompleted.get(start.guid);if(p?.state==='canceled')throw new Error('download canceled');return p?.state==='completed'?p:false;},'download completion');
        const path=join(downloads,start.guid);await until(async()=>{try{return(await stat(path)).isFile();}catch{return false;}},'download file');
        const bytes=await readFile(path);return {path,bytes,suggestedFilename:start.suggestedFilename,sha256:sha256(bytes),completed};
      }
    };
  }catch(error){await close();throw error;}
}




import {execFileSync} from 'node:child_process';
import {lstat,copyFile,rename} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
async function receivePrint() {
 const [outputArg,executable]=process.argv.slice(2);
 if(!outputArg||!executable)throw new Error('Usage: node tools/check-transaction-print.mjs <new-output-dir> <Chromium>');
 const output=resolve(outputArg);await mkdir(output);
 const root=fileURLToPath(new URL('../',import.meta.url)),cli=join(root,'dist/src/household-print.js');
 const note='<b>milk</b> & tea\nBEGIN-LONG-NOTE\n'+Array.from({length:45},(_,i)=>'Line '+String(i+1).padStart(2,'0')+': Keep the original household receipt and the complete note.').join('\n')+'\nEND-LONG-NOTE';
 const rows=[
  {id:'same',type:'income',amountMinor:10000,currency:'usd',date:'2026-10-05',category:' salary ',note:'',createdAt:'2026-10-05T10:00:00Z'},
  {id:'same',type:'expense',amountMinor:1250,currency:'USD',date:'2026-10-03',category:'groceries',note},
  {id:'__proto__',type:'expense',amountMinor:200,currency:'EUR',date:'2026-10-05',category:'groceries',createdAt:null,extra:{merchant:'Café & Co',witness:'FINAL-METADATA-WITNESS'}},
  {id:'outside-before',type:'expense',amountMinor:500,currency:'USD',date:'2026-09-30',category:'groceries'},
  {id:'max',type:'income',amountMinor:Number.MAX_SAFE_INTEGER,currency:'ZZZ',date:'2026-10-06',category:'constructor',note:'Tab\tand CR\rkept literally.',createdAt:{zero:'NEGATIVE_ZERO'}},
  {id:'tie',type:'expense',amountMinor:101,currency:' EUR ',date:'2026-10-05',category:'groceries',note:'',idempotencyKey:'stable-key-1',createdAt:''},
  {id:'outside-after',type:'expense',amountMinor:10,currency:'USD',date:'2026-11-01',category:'groceries'}
 ];
 const raw=Buffer.from(JSON.stringify({version:2,budgets:[],transactions:rows}).replace('"NEGATIVE_ZERO"','-0'));
 const parsed=JSON.parse(raw),positions=[5,1,3,6,2],expected=positions.map(p=>parsed.transactions[p-1]);
 const input=join(output,'authored ledger # %.json'),page=join(output,'review.html'),empty=join(output,'empty.html');
 await writeFile(input,raw);const before=await lstat(input,{bigint:true});
 const receipt={at:new Date().toISOString(),groups:[],screenshots:[],source:{},artifacts:[],browser:null,errors:[],requests:[],cleanup:null};
 for(const p of ['src/transaction-print.ts','src/household-print.ts','test/transaction-print.test.ts','test/transaction-print-cli.test.ts','docs/TRANSACTION_PRINT.md','tools/check-transaction-print.mjs'])receipt.source[p]=sha256(await readFile(join(root,p)));
 async function group(name,fn){await fn();receipt.groups.push({name,passed:true});console.log('PASS '+name);}
 let b;
 try {
 await group('Actual CLI creates complete output and exact provenance without changing the authored ledger',async()=>{
  const stdout=execFileSync(process.execPath,[cli,'--ledger',input,'--from','2026-10-01','--to','2026-10-31','--out',page],{encoding:'utf8'});
  const result=JSON.parse(stdout),bytes=await readFile(page);assert.equal(result.matchedRows,5);assert.deepEqual(result.sourcePositions,positions);
  assert.equal(result.sourceSha256,sha256(raw));assert.equal(result.outputSha256,sha256(bytes));assert.equal(result.outputBytes,bytes.length);
  assert.deepEqual(await readFile(input),raw);const after=await lstat(input,{bigint:true});for(const k of ['ino','mtimeNs','ctimeNs','size'])assert.equal(after[k],before[k]);
  await writeFile(join(output,'actual-cli-receipt.json'),stdout);receipt.artifacts.push({path:page,bytes:bytes.length,sha256:sha256(bytes)});
  execFileSync(process.execPath,[cli,'--ledger',input,'--from','2026-10-01','--to','2026-10-31','--category','salary','--out',empty]);
 });
 b=await openBrowser(output,executable);receipt.browser=b.version;receipt.pid=b.childPid;receipt.profile=b.profile;
 await b.navigate(page,1280,1000);
 await group('Every displayed parsed record equals its exact selected original, including negative zero',async()=>{
  const texts=await b.evaluate('[...document.querySelectorAll(".record-json")].map(e=>e.textContent)');
  assert.deepEqual(texts.map(x=>JSON.parse(x)),expected);
  assert.deepEqual(await b.evaluate('[...document.querySelectorAll("article")].map(e=>Number(e.dataset.sourcePosition))'),positions);
 });
 await group('Literal amounts, currency strings and duplicate IDs are visible without combining rows',async()=>{
  assert.deepEqual(await b.evaluate('[...document.querySelectorAll("article [data-field=currency]")].map(e=>e.textContent)'),expected.map(x=>x.currency));
  assert.deepEqual(await b.evaluate('[...document.querySelectorAll("article [data-field=amountMinor]")].map(e=>e.textContent)'),expected.map(x=>String(x.amountMinor)));
  assert.equal((await b.evaluate('[...document.querySelectorAll("article [data-field=id]")].map(e=>e.textContent)')).filter(x=>x==='same').length,2);
 });
 await group('Missing and empty metadata remain distinct and all note text is literal',async()=>{
  const missing=await b.evaluate('[...document.querySelectorAll("article")].find(e=>e.dataset.sourcePosition==="3").querySelector("[data-field=note] [data-presence]").dataset.presence');assert.equal(missing,'missing');
  const emptyState=await b.evaluate('[...document.querySelectorAll("article")].find(e=>e.dataset.sourcePosition==="6").querySelector("[data-field=note] [data-presence]").dataset.presence');assert.equal(emptyState,'empty');
  assert.equal(await b.evaluate('[...document.querySelectorAll("article")].find(e=>e.dataset.sourcePosition==="2").querySelector("[data-field=note]").textContent'),note);
  assert.equal(await b.evaluate('[...document.querySelectorAll("article")].find(e=>e.dataset.sourcePosition==="5").querySelector("[data-field=note]").textContent'),expected[0].note);
  assert.equal(await b.evaluate('document.querySelectorAll("script,iframe,form,img,link,article b").length'),0);
 });
 await group('Visible source and exact selectors bind the current complete document',async()=>{
  assert.equal(await b.evaluate('document.querySelector("[data-field=source-sha256]").textContent'),sha256(raw));
  assert.equal(await b.evaluate('document.querySelector("[data-field=source-name]").textContent'),'authored ledger # %.json');
  assert.equal(await b.evaluate('document.querySelector("[data-field=range]").textContent'),'2026-10-01 through 2026-10-31');
  assert.match(await b.evaluate('document.querySelector(".count").textContent'),/^5 selected/);
 });
 await group('Desktop1280 and phone390 retain complete records without horizontal overflow',async()=>{
  assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'));
  receipt.screenshots.push(await b.screenshot('desktop.png'));
  await b.viewport(390,844);assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'));
  assert.equal(await b.evaluate('document.querySelectorAll("article").length'),5);
  receipt.screenshots.push(await b.screenshot('phone.png'));
 });
 await group('Actual Letter PDF contains all long-note lines and complete last-record metadata',async()=>{
  await b.viewport(739,1000);await b.command('Emulation.setEmulatedMedia',{media:'print'});
  const pdf=await b.command('Page.printToPDF',{printBackground:true,paperWidth:8.5,paperHeight:11,marginTop:0.4,marginBottom:0.4,marginLeft:0.4,marginRight:0.4,preferCSSPageSize:false});
  const bytes=Buffer.from(pdf.data,'base64'),path=join(output,'review.pdf');await writeFile(path,bytes);
  const text=execFileSync('pdftotext',['-layout',path,'-'],{encoding:'utf8'});await writeFile(join(output,'review-pdf.txt'),text);
  for(const witness of ['BEGIN-LONG-NOTE','END-LONG-NOTE','FINAL-METADATA-WITNESS','9007199254740991','stable-key-1','Saved-array position 2'])assert.ok(text.includes(witness),'PDF missing '+witness);
  for(let i=1;i<=45;i++)assert.ok(text.includes('Line '+String(i).padStart(2,'0')+':'),'PDF missing note line '+i);
  receipt.artifacts.push({path,bytes:bytes.length,sha256:sha256(bytes)});await b.command('Emulation.setEmulatedMedia',{media:''});
 });
 await group('Zero matches is explicit, complete and readable in an actual browser',async()=>{
  await b.navigate(empty,390,844);assert.equal(await b.evaluate('document.querySelectorAll("article").length'),0);
  assert.match(await b.evaluate('document.querySelector("#empty-selection").textContent'),/complete result/);
  assert.match(await b.evaluate('document.querySelector("[data-field=category-selector]").textContent'),/"salary" \(exact\)/);
  assert.ok(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'));
 });
 await group('Fresh relocated HTML works offline after the original input path is absent',async()=>{
  const moved=join(output,'relocated');await mkdir(moved);const movedPage=join(moved,'standalone-review.html');await copyFile(page,movedPage);
  await rename(input,join(output,'fixture-custody.json'));
  await b.navigate(movedPage,1280,1000);
  assert.deepEqual((await b.evaluate('[...document.querySelectorAll(".record-json")].map(e=>e.textContent)')).map(JSON.parse),expected);
  assert.ok(b.requests.every(url=>url.startsWith('file:')));assert.equal(b.errors.length,0);
  assert.deepEqual(await readFile(movedPage),await readFile(page));
 });
 receipt.errors=[...b.errors];receipt.requests=[...b.requests];receipt.accepted=true;
 }catch(error){receipt.accepted=false;receipt.error=String(error.stack??error);throw error;}
 finally {if(b){await b.close();receipt.cleanup={closed:true,profileRemoved:true};}await writeFile(join(output,'browser-receiving.json'),JSON.stringify(receipt,null,2)+'\n');}
}
receivePrint().catch(error=>{console.error(error);process.exitCode=1;});
