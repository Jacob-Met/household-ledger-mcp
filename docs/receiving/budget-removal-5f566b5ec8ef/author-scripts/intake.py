from pathlib import Path
import json,hashlib,subprocess,sys,time,shutil
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef'); s=r/'source'
g='C:/Program Files/Git/cmd/git.exe'
def git(*a):return subprocess.check_output([g,'-C',str(s),*a],text=True).strip()
head=git('rev-parse','HEAD'); assert head=='591ab6f5a2d65bf596aeb707dbb635ee981ec926',head
assert git('status','--porcelain')==''
subprocess.run([g,'-C',str(s),'config','core.autocrlf','false'],check=True)
rows=json.loads((r/'evidence/parent-tree.json').read_text())['tree']; manifest=[]
for x in rows:
 if x['type']!='blob':continue
 b=(s/x['path']).read_bytes(); sha=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
 assert sha==x['sha'],x['path']
 manifest.append({'path':x['path'],'mode':x['mode'],'blob':sha,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
assert not list(s.rglob('AGENTS.md'))
lock=json.loads((s/'package-lock.json').read_text())
print(json.dumps({'head':head,'tree':git('rev-parse','HEAD^{tree}'),'leaves':len(manifest),'instructions':[],'scriptsPackages':[p for p,v in lock['packages'].items() if v.get('hasInstallScript')],'versions':{p:v.get('version') for p,v in lock['packages'].items() if p in ['node_modules/typescript','node_modules/@modelcontextprotocol/sdk','node_modules/@types/node']},'freeD':shutil.disk_usage('D:/').free}),flush=True)
(r/'evidence/source-intake.json').write_text(json.dumps({'head':head,'tree':git('rev-parse','HEAD^{tree}'),'files':manifest},indent=2)+'\n')
print((s/'package.json').read_text())
