from pathlib import Path
import subprocess,json,time,hashlib
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source'
for phase,cmd in [('http-build-v1',['C:/Program Files/nodejs/npm.cmd','run','build']),('candidate-http-v1',['C:/Program Files/nodejs/node.exe','--test','dist/test/budget-removal-http.test.js'])]:
 t=time.time();p=subprocess.run(cmd,cwd=s,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=120)
 print(json.dumps({'phase':phase,'exit':p.returncode,'stdout_tail':p.stdout[-6500:],'stderr_tail':p.stderr[-1500:]}),flush=True)
 (r/'evidence'/f'{phase}.json').write_text(json.dumps({'exit':p.returncode,'seconds':time.time()-t,'stdout':p.stdout,'stderr':p.stderr},indent=2)+'\n')
 if p.returncode:break
pins={p:hashlib.sha256((s/p).read_bytes()).hexdigest() for p in ['src/budget-removal.ts','src/budget-removal-client.ts','src/household-remove-budget.ts','src/index.ts']}
(r/'evidence/runtime-first-pins.json').write_text(json.dumps(pins,indent=2)+'\n');print(json.dumps({'pins':pins}),flush=True)
