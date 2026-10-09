from pathlib import Path
import subprocess,json,time,hashlib
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source'
for phase,cmd in [('queued-token-build-v3',['C:/Program Files/nodejs/npm.cmd','run','build']),('queued-token-focused-v3',['C:/Program Files/nodejs/node.exe','--test','--test-name-pattern=a caller cannot replace','dist/test/budget-removal.test.js'])]:
 t=time.time();p=subprocess.run(cmd,cwd=s,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=90)
 print(json.dumps({'phase':phase,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr}),flush=True)
 (r/'evidence'/f'{phase}.json').write_text(json.dumps({'exit':p.returncode,'seconds':time.time()-t,'stdout':p.stdout,'stderr':p.stderr},indent=2)+'\n')
 if p.returncode:break
print('CORE_SHA256='+hashlib.sha256((s/'src/budget-removal.ts').read_bytes()).hexdigest())
