from pathlib import Path
import subprocess,json,time
r=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef');s=r/'source';t=time.time()
p=subprocess.run(['C:/Program Files/nodejs/npm.cmd','test'],cwd=s,capture_output=True,text=True,encoding='utf-8',errors='replace')
print(json.dumps({'phase':'unchanged-parent','exit':p.returncode,'stdout_tail':p.stdout[-4500:],'stderr_tail':p.stderr[-1500:]}),flush=True)
(r/'evidence/baseline-tests.json').write_text(json.dumps({'exit':p.returncode,'seconds':time.time()-t,'stdout':p.stdout,'stderr':p.stderr},indent=2)+'\n')
