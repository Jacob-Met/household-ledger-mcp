from pathlib import Path
import subprocess,json,hashlib
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source';g='C:/Program Files/Git/cmd/git.exe'
f=json.loads((r/'evidence/source-freeze.json').read_text())
for x in f['owned']:assert hashlib.sha256((s/x['path']).read_bytes()).hexdigest()==x['sha256'],x['path']
def git(*args):return subprocess.check_output([g,'-C',str(s),*args],text=True).strip()
assert git('rev-parse','HEAD')==f['parent']
git('switch','-c','chatgpt/budget-removal-5f566b5ec8ef')
git('add','--',*[x['path'] for x in f['owned']])
out=git('-c','user.name=HAMON production 5f566b5ec8ef','-c','user.email=hamon-production@users.noreply.github.com','commit','-m','Add reviewed removal of one denominated budget')
print(out,flush=True)
record={'commit':git('rev-parse','HEAD'),'tree':git('rev-parse','HEAD^{tree}'),'parent':git('rev-parse','HEAD^'),'status':git('status','--porcelain'),'ownedPaths':[x['path'] for x in f['owned']]}
assert record['status']=='',record['status']
(r/'evidence/product-commit.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record),flush=True)
