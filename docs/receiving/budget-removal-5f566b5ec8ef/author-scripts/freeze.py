from pathlib import Path
import json,hashlib,subprocess
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source'
p=s/'README.md';original=p.read_bytes();extra=b'\n## Remove an obsolete allowance\n\nUse the explicit [reviewed budget removal client](docs/BUDGET_REMOVAL.md) to remove one denominated category/month budget while retaining transactions and all other budgets. Preview is read-only; exact confirmation and a fresh target-value check precede the one removal request.\n'
assert b'## Remove an obsolete allowance' not in original;p.write_bytes(original+extra)
owned=['README.md','src/index.ts','src/budget-removal.ts','src/budget-removal-client.ts','src/household-remove-budget.ts','test/mcp.test.ts','test/transaction-import-http.test.ts','test/budget-removal.test.ts','test/budget-removal-http.test.ts','docs/BUDGET_REMOVAL.md']
parent=json.loads((r/'evidence/source-intake.json').read_text());preserved=[]
for f in parent['files']:
 if f['path'] in owned:continue
 b=(s/f['path']).read_bytes();assert hashlib.sha256(b).hexdigest()==f['sha256'],f['path'];preserved.append(f)
assert (s/'README.md').read_bytes().startswith(original)
record={'parent':parent['head'],'parentTree':parent['tree'],'owned':[{ 'path':p,'bytes':(s/p).stat().st_size,'sha256':hashlib.sha256((s/p).read_bytes()).hexdigest()} for p in owned],'unownedPreserved':len(preserved),'READMEOriginalPrefixSHA256':hashlib.sha256(original).hexdigest()}
(r/'evidence/source-freeze.json').write_text(json.dumps(record,indent=2)+'\n')
p=subprocess.run(['C:/Program Files/Git/cmd/git.exe','-C',str(s),'diff','--','README.md','src/index.ts','test/mcp.test.ts','test/transaction-import-http.test.ts'],capture_output=True,check=True)
(r/'evidence/shared-source.diff').write_bytes(p.stdout)
print(json.dumps(record))
