from pathlib import Path
import json,hashlib,subprocess,difflib,datetime
r=Path('D:/HAMON/household-budget-removal-peer-mac-5f566b5ec8ef');o=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=o/'source'
refs=json.loads((r/'immutable-parent-inputs.json').read_text(encoding='utf-8'));freeze=json.loads((o/'evidence/source-freeze.json').read_text(encoding='utf-8'));owned={x['path']:x for x in freeze['owned']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
for path,x in owned.items():assert sha(s/path)==x['sha256'],path
native={line.split('\t')[1]:line.split('\t')[0].split() for line in subprocess.check_output(['git','-C',str(s),'ls-tree','-r','HEAD'],text=True,encoding='utf-8').splitlines()}
unchanged=[]
for x in refs['parentTree']['tree']:
 if x['type']=='tree' or x['path'] in owned:continue
 p=s/x['path'];data=p.read_bytes();blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest();assert blob==x['sha'],x['path'];assert native[x['path']][0]==x['mode'],x['path'];unchanged.append(x['path'])
assert len(unchanged)==112
index=(s/'src/index.ts').read_text(encoding='utf-8')
pieces=['import { commitBudgetRemoval, previewBudgetRemoval, BUDGET_REMOVAL_TOOL_DEFS } from "./budget-removal.js";\n','  ...BUDGET_REMOVAL_TOOL_DEFS,\n','''        case "preview_budget_removal": {
          const result = await previewBudgetRemoval(store, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
        case "commit_budget_removal": {
          const result = await commitBudgetRemoval(store, args);
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
''']
for piece in pieces:assert index.count(piece)==1;index=index.replace(piece,'',1)
assert index==refs['originalIndex']
assert (s/'src/ledger.ts').read_bytes()==refs['originalLedger'].encode()
old=o/'evidence/queued-token-before/budget-removal.ts';new=s/'src/budget-removal.ts';before=old.read_text(encoding='utf-8');after=new.read_text(encoding='utf-8')
assert hashlib.sha256(old.read_bytes()).hexdigest()=='84b2e89ac2d9a7016d4a993a90254d0a1dae02ec6e5b5b00e3a8380a9909434b'
(r/'token-correction.diff').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='84b-model',tofile='2ed-model')),encoding='utf-8')
first=json.loads((r/'receiver-v1/result.json').read_text());second=json.loads((r/'receiver-v2-fixed/result.json').read_text());assert first['passed']==7 and first['total']==8 and second['passed']==second['total']==1
bad=json.loads((r/'receiver-v1/queued-argument-outcome.json').read_text());good=json.loads((r/'receiver-v2-fixed/queued-argument-outcome.json').read_text());assert bad['outcome']['status']=='fulfilled' and len(bad['actual']['budgets'])==2;assert good['outcome']['status']=='rejected' and good['actual']['budgets'][1]['limitMinor']==99
receipt={'reviewer':'chatgpt:5f566b5ec8ef:mac_continuity','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'decision':'Accepted corrected bounded source and independent native receiving','blindFreeze':json.loads((r/'freeze.json').read_text()),'originalPR8Head':'591ab6f5a2d65bf596aeb707dbb635ee981ec926','candidateHead':subprocess.check_output(['git','-C',str(s),'rev-parse','HEAD'],text=True).strip(),'sourcePins':{p:sha(s/p) for p in owned},'preservation':{'unownedParentLeavesExactBlobAndMode':len(unchanged),'indexThreeInsertionInverseExact':True,'ledgerStoreBytesExact':True,'packageLockWorkflowWithinUnowned':True},'nativePhases':[{'source':'84b2e89ac2d9a7016d4a993a90254d0a1dae02ec6e5b5b00e3a8380a9909434b','result':'receiver-v1/result.json','sha256':sha(r/'receiver-v1/result.json'),'passed':7,'failed':1,'node':first['node'],'inputsUnchanged':first['sourceAndModulesUnchanged']},{'source':'2ed829e4cff2609711021c06bc407bb55b7097e45d36d54f61d336e4e9c4ce26','result':'receiver-v2-fixed/result.json','sha256':sha(r/'receiver-v2-fixed/result.json'),'passed':1,'failed':0,'scope':'Only prior failed queued-argument group replayed','inputsUnchanged':second['sourceAndModulesUnchanged']}],'finding':{'original':'Validated reviewToken was borrowed again from mutable caller arguments after waiting behind Store.update; actual queued call removed a selected limit99 target despite having been invoked with reviewed limit0 token.','correction':'Snapshot validated reviewToken before entering queue; exact same independent case now refuses changed selected target and retains99.','boundary':'Exported native API input lifetime; no remote authentication or network exploit claim.'},'acceptedSourceBoundaries':['Exact category/normalized currency with complete literal target and zero allowance identity','Unknown own keys and nested JSON values bound; object key order stable, array changes stale','Fresh array occurrence found after unrelated queued/inserted state changes','All current unrelated values, Store implementation and existing handlers preserved','Preview object detached and client validates complete content binding before prompt','Mismatched receipt is unconfirmed after one commit; no automatic retry','Finite-number refusal preserves otherwise lossy unknown values; owner witness retained separately','Guide honestly states schema/formatting/ABA/token-not-ledger-identity and Windows inherited direct-entry limitation'],'limits':['No owner baseline/full suite, build, installation, HTTP or terminal fixture repeated by peer.','First seven groups retain84b phase; only failed group executed on2ed correction.','Direct RDC Node invocations returned recorded case outputs; process exit codes were not independently retained by those fast sessions.','No live ledger/provider, authentication, cross-process writer or identical-recreate history guarantee.'],'extraSourceReads':['Final guide1f8dacfdf5a0d3eb33984b0a5aff756b491ed4805d0e36f83dd73fc3c61c7a69','Final correction diff','Whole original PR8 ledger/index; full candidate client/CLI/core and additive index inverse'],'ownerSourceEdits':False}
(r/'independent-review.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
files=[]
for p in sorted(r.rglob('*')):
 if p.is_file() and p.name!='manifest.json':
  b=p.read_bytes();files.append({'path':str(p.relative_to(r)).replace('\\','/'),'size':len(b),'sha256':hashlib.sha256(b).hexdigest()})
(r/'manifest.json').write_text(json.dumps({'files':files,'sourceNamespaceOnly':'Peer fixtures, immutable original-source references, scripts and results; no owner product edits.'},indent=2)+'\n',encoding='utf-8')
print(json.dumps({'reviewSha256':sha(r/'independent-review.json'),'manifestSha256':sha(r/'manifest.json'),'files':len(files),'unownedVerified':len(unchanged),'nativeHead':receipt['candidateHead']}))
