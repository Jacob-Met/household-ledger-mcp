from pathlib import Path
import subprocess,json,time,os,hashlib
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef'); s=r/'source'
env=os.environ.copy(); env['npm_config_cache']=str(r/'npm-cache')
t=time.time()
p=subprocess.run(['C:/Program Files/nodejs/npm.cmd','ci','--ignore-scripts','--no-audit','--no-fund'],cwd=s,env=env,capture_output=True,text=True)
print(json.dumps({'phase':'dependency-admission','exit':p.returncode,'stdout_tail':p.stdout[-2500:],'stderr_tail':p.stderr[-2500:]}),flush=True)
(r/'evidence/dependency-admission.json').write_text(json.dumps({'exit':p.returncode,'seconds':time.time()-t,'stdout':p.stdout,'stderr':p.stderr,'lockSHA256':hashlib.sha256((s/'package-lock.json').read_bytes()).hexdigest()},indent=2)+'\n')
raise SystemExit(p.returncode)
