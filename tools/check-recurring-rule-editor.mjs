// Maintained direct-file browser check. Transport adapted from the cohort's accepted
// pneumatic setup receiver (2445dc81); assertions and fixtures below are specific to this editor.
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
  while(Date.now()<end){try{const value=await check();if(value)return value;}catch(error){if(error.fatal)throw error;last=error;}await pause(100);}
  throw new Error('Timed out: '+label+(last?' ('+last.message+')':''));
}
export async function openBrowser(output,executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'){
  output=resolve(output);await mkdir(output,{recursive:true});
  const profile=await mkdtemp(join(output,'profile-'));
  const downloads=join(output,'downloads');await mkdir(downloads,{recursive:true});
  const child=spawn(executable,['--headless=new','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking',
    '--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check',
    '--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],
    {stdio:['ignore','ignore','pipe']});
  let log='',launchError,socket,sessionId,sequence=0;
  const pending=new Map(),events=[],errors=[],requests=[],downloadsStarted=[],downloadsCompleted=new Map();
  child.stderr.on('data',bytes=>{log+=bytes.toString();});
  child.on('error',error=>{launchError=error;});
  let exitObservation=null;child.on('exit',(code,signal)=>{exitObservation={at:new Date().toISOString(),code,signal};});
  await writeFile(join(output,'browser-launch.json'),JSON.stringify({pid:child.pid,profile,tmpdir:process.env.TMPDIR,storageFlag:'--disable-dev-shm-usage',sandboxUnchanged:true})+'\n',{flag:'wx'});
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
    const codes={Space:32,Enter:13,Tab:9,Home:36,End:35,ArrowRight:39,ArrowLeft:37,ArrowUp:38,ArrowDown:40};
    for(const type of ['keyDown','keyUp'])await command('Input.dispatchKeyEvent',{
      type,key:name==='Space'?' ':name,code:name,windowsVirtualKeyCode:codes[name]??0,nativeVirtualKeyCode:codes[name]??0,
      ...(name==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:name==='Space'&&type==='keyDown'?{text:' ',unmodifiedText:' '}:{})
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
    await writeFile(join(output,'browser-exit.json'),JSON.stringify({pid:child.pid,profile,exitCode:child.exitCode,signalCode:child.signalCode,exitObservation,alive:alive()})+'\n',{flag:'wx'});
    if(alive())throw new Error('Owned browser did not exit; profile preserved for inspection.');
    await rm(profile,{recursive:true,force:true});
  }
  try{
    const [port,endpoint]=await until(async()=>{
      if(launchError){launchError.fatal=true;throw launchError;}
      if(child.exitCode!==null||child.signalCode!==null){const error=new Error('browser ended '+child.exitCode+' signal '+child.signalCode+': '+log);error.fatal=true;throw error;}
      const fields=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split('\n');
      return fields[0]&&fields[1]?fields:false;
    },'Chrome startup',45000);
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
    await command('Network.setBlockedURLs',{urls:['https://*']});
    return {version,childPid:child.pid,profile,command,evaluate,key,activate,close,errors,requests,events,downloadsStarted,downloadsCompleted,
      async viewport(width,height=1000){await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});},
      async navigate(path,width=1280,height=1000){
        errors.length=0;requests.length=0;
        await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
        const url=path.startsWith('http://127.0.0.1:')?path:pathToFileURL(resolve(path)).href;await command('Page.navigate',{url});
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

const [htmlArg, outputArg] = process.argv.slice(2);
assert.ok(htmlArg && outputArg, 'Usage: node tools/check-recurring-rule-editor.mjs <built HTML> <new output directory>');
const html=resolve(htmlArg), output=resolve(outputArg);
await mkdir(output,{recursive:true});
const originalBytes=await readFile(html), originalHash=sha256(originalBytes);
const canonical=x=>Buffer.from(JSON.stringify(x,null,2)+'\n');
const imported={
  schema:'household-recurring-expenses/1',currency:' usd ',rules:[
    {id:'rent-α',start:'2026-01-31',category:' Home ',amountMinor:125000,repeat:{unit:'month',every:1,missingDay:'last'}},
    {id:'food-β',start:'2026-10-05',end:'2026-11-30',category:'Food',amountMinor:3450,note:'first\r\nsecond\rthird\n',repeat:{unit:'week',every:2}}
  ]};
const created={schema:'household-recurring-expenses/1',currency:' EUR ',rules:[
  {id:'new-α',start:'2026-01-31',category:' Home ',amountMinor:12500,repeat:{unit:'month',every:1,missingDay:'last'}}
]};
const inputPath=join(output,'original-rules.json'), invalidPath=join(output,'unknown-field.json');
await writeFile(inputPath,canonical(imported),{flag:'wx'});
await writeFile(invalidPath,canonical({...imported,unknown:true}),{flag:'wx'});
const receipt={at:new Date().toISOString(),html:{path:html,bytes:originalBytes.length,sha256:originalHash},
  groups:[],downloads:[],screenshots:[],chooserAdmissions:[],faultInjections:[],passed:false};
let browser;
function pass(name,details={}){receipt.groups.push({name,passed:true,...details});}
function downloadRow(d){return {path:d.path,bytes:d.bytes.length,sha256:d.sha256,suggestedFilename:d.suggestedFilename};}
try {
  browser=await openBrowser(output,process.env.CHROME||'/snap/chromium/current/usr/lib/chromium-browser/chrome');
  receipt.browser=browser.version;
  await browser.navigate(html);
  const val=selector=>browser.evaluate('document.querySelector('+JSON.stringify(selector)+').value');
  const hidden=selector=>browser.evaluate('document.querySelector('+JSON.stringify(selector)+').hidden');
  const disabled=selector=>browser.evaluate('document.querySelector('+JSON.stringify(selector)+').disabled');
  const rules=()=>browser.evaluate("[...document.querySelectorAll('#rules article pre')].map(e=>JSON.parse(e.textContent))");
  const text=selector=>browser.evaluate('document.querySelector('+JSON.stringify(selector)+').textContent');
  async function fill(selector,value){
    await browser.evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');
    for(const type of ['keyDown','keyUp'])await browser.command('Input.dispatchKeyEvent',{type,key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});
    for(const type of ['keyDown','keyUp'])await browser.command('Input.dispatchKeyEvent',{type,key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
    if(value)await browser.command('Input.insertText',{text:value});
    assert.equal(await val(selector),value);
  }
  async function choose(selector,value){
    await browser.evaluate('document.querySelector('+JSON.stringify(selector)+').focus()');
    await browser.key('Home');
    for(let i=0;i<8;i++){if(await val(selector)===value)return;await browser.key('ArrowDown');}
    assert.fail('select value not reached: '+selector+' '+value);
  }
  async function openFile(path){
    await browser.command('DOM.enable');
    const {root}=await browser.command('DOM.getDocument',{depth:0});
    const {nodeId}=await browser.command('DOM.querySelector',{nodeId:root.nodeId,selector:'#file'});
    const {node}=await browser.command('DOM.describeNode',{nodeId});
    await browser.command('Page.setInterceptFileChooserDialog',{enabled:true});
    const offset=browser.events.length;
    await browser.activate('#open');
    const event=await until(()=>browser.events.slice(offset).find(e=>e.method==='Page.fileChooserOpened'),'physical Open chooser');
    assert.equal(event.params.backendNodeId,node.backendNodeId);
    await browser.command('DOM.setFileInputFiles',{backendNodeId:event.params.backendNodeId,files:[path]});
    await browser.command('Page.setInterceptFileChooserDialog',{enabled:false});
    receipt.chooserAdmissions.push({path,backendNodeId:event.params.backendNodeId});
  }
  async function save(expected,label){
    assert.equal(await disabled('#save'),false);
    const d=await browser.download('#save');
    assert.deepEqual(d.bytes,canonical(expected),label);
    assert.equal(d.suggestedFilename,'household-recurring-rules.json');
    receipt.downloads.push({...downloadRow(d),label});return d;
  }
  assert.equal(await disabled('#save'),true);assert.equal(await disabled('#add-rule'),true);
  assert.deepEqual(await rules(),[]);assert.equal(await val('#currency'),'');
  pass('empty start requires an explicit currency or file');
  await fill('#currency',' EUR ');await browser.activate('#apply-currency');
  await browser.activate('#add-rule');
  for(const [key,value] of Object.entries({id:'new-α',start:'2026-01-31',category:' Home ',amount:'12500',every:'1'}))await fill('#rule-'+key,value);
  await choose('#rule-unit','month');
  assert.equal(await val('#rule-missing'),'');
  await browser.activate('#apply-rule');
  assert.equal(await hidden('#rule-form'),false);assert.equal(await disabled('#save'),true);
  assert.ok((await text('#error')).length>0);
  await choose('#rule-missing','last');await browser.activate('#apply-rule');
  assert.deepEqual(await rules(),created.rules);
  await save(created,'created-monthly-rule');
  pass('physical create requires monthly missing-day choice and saves complete exact bytes');
  await openFile(inputPath);await until(async()=>!(await hidden('#preview')),'literal preview');
  assert.deepEqual(JSON.parse(await text('#preview-json')),imported);
  assert.deepEqual(await rules(),created.rules);
  await browser.activate('#cancel-preview');
  assert.equal(await hidden('#preview'),true);assert.deepEqual(await rules(),created.rules);
  pass('physical Open and Cancel preserve current complete rules');
  await openFile(inputPath);await until(async()=>!(await hidden('#preview')),'second preview');
  await browser.activate('#replace');
  assert.deepEqual(await rules(),imported.rules);assert.equal(await val('#currency'),' usd ');
  const composition=await save(imported,'unchanged-producer-composition-input');
  receipt.compositionInput=downloadRow(composition);
  pass('Replace and physical Save retain raw whitespace, CR/LF notes and absent optional fields');
  await browser.activate('#rules article[data-position="1"] button:nth-child(1)');
  assert.equal(await disabled('#save'),true);
  await fill('#rule-amount','4000');await browser.activate('#apply-rule');
  const edited=JSON.parse(JSON.stringify(imported));edited.rules[1].amountMinor=4000;
  assert.deepEqual(await rules(),edited.rules);
  await browser.activate('#rules article[data-position="1"] button:nth-child(2)');
  edited.rules.reverse();assert.deepEqual(await rules(),edited.rules);
  await browser.activate('#rules article[data-position="1"] button:nth-child(4)');
  edited.rules.pop();assert.deepEqual(await rules(),edited.rules);
  await save(edited,'amount-edit-order-and-removal');
  pass('amount-only edit preserves untouched mixed-line-ending note; explicit move/remove save');
  await openFile(invalidPath);await until(async()=>(await text('#error')).length>0,'invalid Open refusal');
  assert.equal(await hidden('#preview'),true);assert.deepEqual(await rules(),edited.rules);
  await fill('#currency',' GBP ');assert.equal(await disabled('#save'),true);
  await fill('#currency',' usd ');await browser.activate('#apply-currency');
  assert.deepEqual(await rules(),edited.rules);assert.equal(await disabled('#save'),false);
  pass('invalid file is atomic and pending currency prevents Save until Apply');
  await browser.evaluate("window.__savedArrayBuffer=File.prototype.arrayBuffer;window.__readWaiting=false;window.__readDone=false;File.prototype.arrayBuffer=function(){const p=window.__savedArrayBuffer.call(this);return p.then(bytes=>new Promise(resolve=>{window.__readWaiting=true;window.__releaseRead=()=>{resolve(bytes);window.__readDone=true;};}));};");
  receipt.faultInjections.push('Receiver delays resolution of actual File.arrayBuffer bytes; no replacement payload.');
  await openFile(inputPath);await until(()=>browser.evaluate('window.__readWaiting'),'actual pending file bytes');
  await fill('#currency',' EUR ');await browser.evaluate('window.__releaseRead();File.prototype.arrayBuffer=window.__savedArrayBuffer;');
  await until(()=>browser.evaluate('window.__readDone'),'delayed read release');
  await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  assert.equal(await hidden('#preview'),true);assert.deepEqual(await rules(),edited.rules);
  await fill('#currency',' usd ');await browser.activate('#apply-currency');
  pass('ordinary edit retires a delayed actual file read without replacing current rules');
  await browser.activate('#add-rule');await fill('#rule-id','unsaved');assert.equal(await disabled('#save'),true);
  await browser.activate('#cancel-rule');assert.deepEqual(await rules(),edited.rules);
  receipt.screenshots.push(await browser.screenshot('desktop.png'));
  await browser.viewport(390,844);
  assert.ok(await browser.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'390px horizontal overflow');
  receipt.screenshots.push(await browser.screenshot('phone-390.png'));
  await browser.command('Page.reload');
  await until(()=>browser.evaluate('document.readyState==="complete"&&document.querySelector("#count").textContent==="No current rule set"'),'fresh empty reload');
  assert.equal(await disabled('#save'),true);assert.deepEqual(await rules(),[]);
  pass('pending form cancels; desktop/390px layout; reload retains no unsaved data');
  assert.deepEqual(browser.errors,[]);
  const unexpected=browser.requests.filter(url=>!url.startsWith('file:')&&!url.startsWith('blob:'));
  assert.deepEqual(unexpected,[]);
  receipt.requests=[...browser.requests];receipt.pageErrors=[...browser.errors];
  assert.equal(sha256(await readFile(html)),originalHash);
  receipt.passed=true;
} catch(error) {
  receipt.failure={name:error.name,message:error.message,stack:error.stack};
  if(browser){try{receipt.failureDOM=await browser.evaluate('document.body.innerText');receipt.screenshots.push(await browser.screenshot('failure.png'));}catch(e){receipt.diagnosticError=e.message;}}
} finally {
  if(browser){try{await browser.close();}catch(error){receipt.passed=false;receipt.cleanupError=error.message;}}
  await writeFile(join(output,'browser-receiving.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
}
console.log(JSON.stringify({passed:receipt.passed,groups:receipt.groups.length,receipt:join(output,'browser-receiving.json')}));
if(!receipt.passed)process.exitCode=1;
