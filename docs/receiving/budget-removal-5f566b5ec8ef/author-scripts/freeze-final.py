from pathlib import Path
import hashlib,json,shutil,subprocess
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source'
p=s/'docs/BUDGET_REMOVAL.md';shutil.copy2(p,r/'evidence/guide-before-token-correction.md')
t=p.read_text();needle='Run the maintained feature tests after building:\n'
assert t.count(needle)==1
t=t.replace(needle,'An independent receiver then passed seven groups and found a queued-call input-lifetime failure: a native caller could replace its argument token while waiting behind another Store update. The commit now captures the validated token before entering that queue. The original failure and source remain intact; one new maintained regression passed on that correction. Independent receiving has its own phase-pinned receipt. No earlier whole suite is claimed as rerun.\n\n'+needle)
p.write_text(t,newline='\n')
shutil.copy2(r/'evidence/source-freeze.json',r/'evidence/source-freeze-first.json')
owned=['README.md','src/index.ts','src/budget-removal.ts','src/budget-removal-client.ts','src/household-remove-budget.ts','test/mcp.test.ts','test/transaction-import-http.test.ts','test/budget-removal.test.ts','test/budget-removal-http.test.ts','docs/BUDGET_REMOVAL.md']
parent=json.loads((r/'evidence/source-intake.json').read_text());preserved=[]
for f in parent['files']:
 if f['path'] in owned:continue
 assert hashlib.sha256((s/f['path']).read_bytes()).hexdigest()==f['sha256'],f['path'];preserved.append(f)
g='C:/Program Files/Git/cmd/git.exe'
readme=subprocess.check_output([g,'-C',str(s),'show',parent['head']+':README.md'])
assert (s/'README.md').read_bytes().startswith(readme)
record={'parent':parent['head'],'parentTree':parent['tree'],'owned':[{'path':p,'bytes':(s/p).stat().st_size,'sha256':hashlib.sha256((s/p).read_bytes()).hexdigest()} for p in owned],'unownedPreserved':len(preserved),'READMEOriginalPrefixSHA256':hashlib.sha256(readme).hexdigest()}
(r/'evidence/source-freeze.json').write_text(json.dumps(record,indent=2)+'\n')
qualification={'owner':'chatgpt:5f566b5ec8ef:production','native':'MSI Windows, Node24.19.0','sourceParent':parent['head'],'states':{'implemented':True,'nativeQualified':True,'integrated':False,'installed':False,'actions':False},'phases':[{'path':'baseline-tests.json','exit':1,'pass':89,'fail':12,'reason':'unchanged Windows direct-entry guard exits0 before HTTP listening'},{'path':'baseline-gap.json','missingRemovalTool':True,'zeroAllowanceStillPresent':True},{'path':'candidate-domain-v1.json','exit':0,'newPass':16,'existingMCPPass':4,'core':'27b53168'},{'path':'candidate-http-v1.json','exit':0,'pass':5,'core':'27b53168','realCLI':True,'postSaveResponseLossRequests':1},{'path':'nonfinite-before/receipt.json','assertionExit':1,'productFinding':'Unrelated1e400 becomesnull via unchanged JSON writer'},{'path':'nonfinite-focused-v2.json','exit':0,'pass':3,'newControls':1,'core':'84b2e89a'},{'path':'queued-token-focused-v3.json','exit':0,'pass':1,'core':'2ed829e4'}],'sourcePreservation':{'unownedParentLeaves':112,'readmePrefix':True,'existingStoreSchemaPackageLockWorkflowsUnchanged':True},'limitations':['Only authored private ledgers. No live/installed service was opened.','Current-value token is not authentication or ledger identity and does not detect identical remove/recreate history.','Store single-process queue and writer reused, no cross-process promise.','Initial tests not relabeled as rerun on later source.','Actions/source-publication hold; PR8 receiving parent ownership remains external.','Conscience database remains held by storage failure; external issue19 is source claim, not resident lease.'],'toolingNotes':['First HTTP receiver text construction had a local JavaScript quoting SyntaxError before any native write; corrected source construction retained in actual maintained test.']}
(r/'evidence/author-qualification.json').write_text(json.dumps(qualification,indent=2)+'\n')
print(json.dumps({'freeze':hashlib.sha256((r/'evidence/source-freeze.json').read_bytes()).hexdigest(),'guide':hashlib.sha256(p.read_bytes()).hexdigest(),'owned':len(owned),'unowned':len(preserved)}))
