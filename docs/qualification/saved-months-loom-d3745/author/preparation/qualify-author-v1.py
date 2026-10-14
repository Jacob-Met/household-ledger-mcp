import datetime, hashlib, json, pathlib, stat, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
CANDIDATE = ROOT/'candidate'
OUT = ROOT/'author-v1'

def identity(p):
    b=p.read_bytes()
    return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'mode':stat.S_IMODE(p.stat().st_mode)}
def snap(root):
    return {p.relative_to(root).as_posix():identity(p) for p in sorted(root.rglob('*')) if p.is_file()}

before=snap(CANDIDATE)
fixtures=snap(ROOT/'fixtures-v1')
controls=snap(ROOT/'preparation')
freeze={'schema':'hamon.loom.household-months-author-freeze.v1','frozen_at':datetime.datetime.now(datetime.timezone.utc).isoformat(), 'root':str(CANDIDATE),'source_files':before,'fixtures':fixtures,'controls':controls,'qualified_parent':'591ab6f5a2d65bf596aeb707dbb635ee981ec926'}
freeze_path=OUT/'source-freeze.json'
assert not freeze_path.exists()
freeze_path.write_text(json.dumps(freeze,indent=2)+'\n')
commands=[('focused-tests',['node','--test','test/ledger-months.test.mjs']),('mixed-cli',['node','tools/household-months.mjs','--ledger',str(ROOT/'fixtures-v1/mixed-ledger.json')])]
results=[]
for name,command in commands:
    started=datetime.datetime.now(datetime.timezone.utc).isoformat()
    p=subprocess.run(command,cwd=CANDIDATE,capture_output=True,timeout=60)
    stdout=OUT/(name+'.stdout');stderr=OUT/(name+'.stderr')
    assert not stdout.exists() and not stderr.exists()
    stdout.write_bytes(p.stdout);stderr.write_bytes(p.stderr)
    results.append({'name':name,'command':command,'cwd':str(CANDIDATE),'started':started,'finished':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit_code':p.returncode,'stdout':identity(stdout),'stderr':identity(stderr)})
    if p.returncode!=0:break
after=snap(CANDIDATE)
checks={'commands_closed_zero':len(results)==2 and all(x['exit_code']==0 for x in results),'source_preserved':before==after,'fixtures_preserved':fixtures==snap(ROOT/'fixtures-v1'),'controls_preserved':controls==snap(ROOT/'preparation')}
if checks['commands_closed_zero']:
    tap=(OUT/'focused-tests.stdout').read_text()
    checks['eleven_methods_no_failures_or_skips']=all(s in tap for s in ['# tests 11\n','# pass 11\n','# fail 0\n','# skipped 0\n'])
    value=json.loads((OUT/'mixed-cli.stdout').read_bytes())
    checks['complete_mixed_counts']=value['counts']=={'transactions':4,'budgets':5,'months':4}
    checks['exact_admitted_month_keys']=[x['month'] for x in value['months']]==['0000-01','1969-12','2026-10','2026-12']
    checks['empty_cli_stderr']=(OUT/'mixed-cli.stderr').read_bytes()==b''
receipt={'schema':'hamon.loom.household-months-author.v1','commands':results,'checks':checks,'accepted':all(checks.values()),'source_before':before,'source_after':after,'fixtures_before':fixtures,'fixtures_after':snap(ROOT/'fixtures-v1'),'controls_before':controls,'controls_after':snap(ROOT/'preparation'),'scope':'Node24.19 cloud, exact inherited ledger transformed once by standard Node API;11 focused methods and one separately retained authored mixed CLI. No tsc/full-suite/SDK/native-install claim.'}
(OUT/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'accepted':receipt['accepted'],'commands':[(x['name'],x['exit_code']) for x in results],'checks':checks,'receipt':identity(OUT/'receipt.json')}))
if not receipt['accepted']:raise SystemExit(1)
