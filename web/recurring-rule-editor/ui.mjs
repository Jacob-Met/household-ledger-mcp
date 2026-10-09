import { MAX_BYTES, MAX_RULES, decodeRules, encodeRules, validateDocument, replaceRule, removeRule, moveRule, parsePositiveInteger } from './model.mjs';
const $ = id => document.getElementById(id);
const currency = $('currency'), form = $('rule-form'), preview = $('preview');
const fields = Object.fromEntries(['id','start','end','category','amount','unit','every','missing','note'].map(key => [key,$('rule-'+key)]));
const endOn = $('end-on'), noteOn = $('note-on');
let current = null, revision = 0, ticket = 0, proposed = null, alive = true, downloadURL = null;
let editing = false, editingIndex = null, baseRule = null, initialForm = null;
let changedFields = new Set(), currencyChanged = false, currencyDisplay = '';
const clone = value => JSON.parse(JSON.stringify(value));
function status(text) { $('status').textContent = text; }
function error(text) { $('error').textContent = text; }
function values() {
  return { ...Object.fromEntries(Object.entries(fields).map(([key,e])=>[key,e.value])), endOn:endOn.checked, noteOn:noteOn.checked };
}
function snapshot() {
  return JSON.stringify({ revision, current, currency:currency.value, currencyChanged,
    editing, editingIndex, values:values(), changed:[...changedFields].sort() });
}
function currencyPending() { return currencyChanged || currency.value !== currencyDisplay; }
function retire() {
  ticket++; proposed = null; preview.hidden = true; $('preview-json').textContent = '';
  $('replace').disabled = true;
}
function repeatControls() {
  fields.missing.disabled = fields.unit.value !== 'month';
  $('missing-choice').hidden = fields.unit.value !== 'month';
  fields.end.disabled = !endOn.checked; fields.note.disabled = !noteOn.checked;
}
function sync() {
  const pending = editing || currencyPending();
  $('save').disabled = !current || pending;
  $('add-rule').disabled = !current || pending || current.rules.length >= MAX_RULES;
  $('apply-currency').disabled = editing;
  $('open').disabled = pending && current !== null || editing;
  for (const button of $('rules').querySelectorAll('button')) {
    button.disabled = pending || button.dataset.edge === 'true';
  }
  $('work-state').textContent = editing ? 'Rule changes are pending. Apply or Cancel before saving.' :
    currencyPending() ? 'Currency change is pending. Apply before saving.' :
    current ? 'Current rule set is ready to save. Downloads are manual.' : 'Apply a currency or open a saved rule file to begin.';
}
function closeForm() {
  editing = false; editingIndex = null; baseRule = null; initialForm = null; changedFields = new Set();
  form.hidden = true;
}
function commit(next, message) {
  current = next; revision++; closeForm(); currency.value = current.currency;
  currencyDisplay = currency.value; currencyChanged = false; retire(); render(); error(''); status(message);
}
function button(label, action, edge = false) {
  const b = document.createElement('button'); b.type='button'; b.textContent=label; b.dataset.edge=String(edge);
  b.addEventListener('click',action); return b;
}
function render() {
  $('rules').replaceChildren();
  $('count').textContent = current ? current.rules.length + ' of 100 rules' : 'No current rule set';
  if (current) current.rules.forEach((r,index) => {
    const article=document.createElement('article'); article.className='rule'; article.dataset.position=String(index);
    const h=document.createElement('h3'); h.textContent=(index+1)+'. '+r.id; article.append(h);
    const summary=document.createElement('p');
    summary.textContent=r.amountMinor+' minor units · '+JSON.stringify(r.category)+' · every '+r.repeat.every+' '+r.repeat.unit+
      (r.repeat.every===1?'':'s')+' · from '+r.start+(r.end?' through '+r.end:' · no end date');
    article.append(summary);
    const detail=document.createElement('details'), caption=document.createElement('summary'), literal=document.createElement('pre');
    caption.textContent='Complete literal rule'; literal.textContent=JSON.stringify(r,null,2); detail.append(caption,literal); article.append(detail);
    const actions=document.createElement('div'); actions.className='row-actions';
    actions.append(button('Edit',()=>begin(index)),button('Move earlier',()=>perform(()=>moveRule(current,index,-1),'Rule moved earlier.'),index===0),
      button('Move later',()=>perform(()=>moveRule(current,index,1),'Rule moved later.'),index===current.rules.length-1),
      button('Remove',()=>perform(()=>removeRule(current,index),'Rule removed from this unsaved workspace.')));
    article.append(actions); $('rules').append(article);
  });
  if (current && current.rules.length === 0) {
    const p=document.createElement('p'); p.textContent='No rules yet. Add a rule, or save an empty rule set.'; $('rules').append(p);
  }
  sync();
}
function perform(action, message) {
  try { if (editing || currencyPending()) throw new Error('Apply or cancel pending changes first.'); commit(action(),message); }
  catch(e) { error(e.message); }
}
function begin(index) {
  if (!current || editing || currencyPending()) return;
  retire(); error(''); editing=true; editingIndex=index; changedFields=new Set();
  baseRule=index===null?null:clone(current.rules[index]);
  const r=baseRule;
  fields.id.value=r?.id??''; fields.start.value=r?.start??''; fields.end.value=r?.end??'';
  fields.category.value=r?.category??''; fields.amount.value=r?String(r.amountMinor):'';
  fields.unit.value=r?.repeat.unit??''; fields.every.value=r?String(r.repeat.every):'';
  fields.missing.value=r?.repeat.missingDay??''; fields.note.value=r?.note??'';
  endOn.checked=Boolean(r && Object.hasOwn(r,'end')); noteOn.checked=Boolean(r && Object.hasOwn(r,'note'));
  initialForm=values(); form.hidden=false; $('rule-heading').textContent=index===null?'Add a rule':'Edit rule '+(index+1);
  repeatControls(); sync(); fields.id.focus();
}
function textValue(key, originalKey=key) {
  const value=fields[key].value;
  if (baseRule && Object.hasOwn(baseRule,originalKey) && !changedFields.has(key) && value===initialForm[key]) return baseRule[originalKey];
  return value;
}
function readRule() {
  const r={id:textValue('id'),start:textValue('start')};
  if (endOn.checked) r.end=textValue('end');
  r.category=textValue('category');
  r.amountMinor=parsePositiveInteger(fields.amount.value,Number.MAX_SAFE_INTEGER,'Amount');
  if (noteOn.checked) r.note=textValue('note');
  const unit=fields.unit.value;
  r.repeat={unit,every:parsePositiveInteger(fields.every.value,unit==='week'?52:120,'Interval')};
  if (unit==='month') r.repeat.missingDay=fields.missing.value;
  return r;
}
$('apply-currency').addEventListener('click',()=>{
  try {
    if (editing) throw new Error('Apply or cancel the rule first.');
    const nextCurrency=current && !currencyPending()?current.currency:currency.value;
    const next=validateDocument({schema:'household-recurring-expenses/1',currency:nextCurrency,rules:current?.rules??[]});
    commit(next,'Currency applied. No monthly plan has been generated.');
  } catch(e) { error(e.message); sync(); }
});
currency.addEventListener('input',()=>{currencyChanged=true;retire();error('');sync();});
$('add-rule').addEventListener('click',()=>begin(null));
for (const [key,element] of Object.entries(fields)) {
  element.addEventListener('input',()=>{changedFields.add(key);retire();error('');repeatControls();sync();});
  element.addEventListener('change',()=>{changedFields.add(key);retire();error('');repeatControls();sync();});
}
for (const [key,element] of [['endOn',endOn],['noteOn',noteOn]]) element.addEventListener('change',()=>{
  changedFields.add(key);retire();error('');repeatControls();sync();
});
form.addEventListener('submit',event=>{
  event.preventDefault();
  try {
    if (!editing || !current || currencyPending()) throw new Error('Apply the currency before editing a rule.');
    commit(replaceRule(current,editingIndex,readRule()),'Rule applied to this workspace. Save to keep the rule file.');
    $('add-rule').focus();
  } catch(e) { error(e.message); sync(); }
});
$('cancel-rule').addEventListener('click',()=>{closeForm();retire();error('');sync();status('Pending rule changes discarded.');$('add-rule').focus();});
$('open').addEventListener('click',()=>{
  if (editing || current && currencyPending()) {error('Apply or cancel pending changes first.');return;}
  retire(); error(''); $('file').value=''; $('file').click();
});
$('file').addEventListener('change',async()=>{
  const file=$('file').files[0]; retire();
  if (!file) return;
  if (editing || current && currencyPending()) {error('Apply or cancel pending changes before opening.');return;}
  const token=ticket, stamp=snapshot();
  try {
    if (file.size>MAX_BYTES) throw new Error('Rule file exceeds 1 MiB.');
    const bytes=new Uint8Array(await file.arrayBuffer());
    const next=decodeRules(bytes);
    if (!alive || token!==ticket || stamp!==snapshot()) return;
    proposed={next,stamp,token};
    $('preview-name').textContent=file.name;
    $('preview-size').textContent=bytes.byteLength+' source bytes; '+next.rules.length+' rules';
    $('preview-json').textContent=JSON.stringify(next,null,2);
    preview.hidden=false; $('replace').disabled=false; error(''); status('File opened for preview. Current work is unchanged.'); $('replace').focus();
  } catch(e) {
    if (alive && token===ticket) {error(e.message);status('Open refused. Current work is unchanged.');}
  }
});
$('cancel-preview').addEventListener('click',()=>{retire();error('');status('Preview cancelled. Current work is unchanged.');$('open').focus();});
$('replace').addEventListener('click',()=>{
  if (!proposed || proposed.token!==ticket || proposed.stamp!==snapshot()) {
    retire();error('Current input changed. Open the file again before Replace.');sync();return;
  }
  try { commit(validateDocument(proposed.next),'Preview replaced the current rule set. Save when ready.'); $('save').focus(); }
  catch(e) {retire();error(e.message);}
});
$('save').addEventListener('click',()=>{
  try {
    if (!current || editing || currencyPending()) throw new Error('Apply or cancel pending changes before Save.');
    const bytes=encodeRules(current);
    const nextURL=URL.createObjectURL(new Blob([bytes],{type:'application/json;charset=utf-8'}));
    if (downloadURL) URL.revokeObjectURL(downloadURL); downloadURL=nextURL;
    const link=document.createElement('a'); link.href=downloadURL; link.download='household-recurring-rules.json';
    link.hidden=true; document.body.append(link); link.click(); link.remove();
    error('');status('Download prepared: '+bytes.byteLength+' bytes. Keep this rule file; generating a month is a separate explicit command.');
  } catch(e) {error(e.message);sync();}
});
window.addEventListener('pagehide',()=>{alive=false;retire();if(downloadURL)URL.revokeObjectURL(downloadURL);downloadURL=null;});
repeatControls();render();
