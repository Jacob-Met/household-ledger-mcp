"""Once-only candidate-blind saved-month CLI receiving; no product retries."""
import argparse,hashlib,json,os,signal,stat,subprocess,time,traceback
from pathlib import Path

ROOT=Path(__file__).resolve().parent
def need(ok,why):
    if not ok:raise ValueError(why)
def identity(path):
    p=Path(path);s=p.lstat();result={'mode':stat.S_IMODE(s.st_mode),'mtime_ns':s.st_mtime_ns,'kind':'link' if p.is_symlink() else 'file'}
    if p.is_symlink():result['target']=os.readlink(p)
    else:
        need(stat.S_ISREG(s.st_mode),'regular file '+str(p));raw=p.read_bytes();result.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
    return result
def inventory(paths):return {str(p):identity(p) for p in sorted(paths)}
parser=argparse.ArgumentParser();parser.add_argument('--offer',required=True);parser.add_argument('--node',required=True);parser.add_argument('--output',required=True);args=parser.parse_args()
freeze=json.loads((ROOT/'freeze-v2.json').read_bytes())
for p,wanted in freeze['inputs'].items():need(identity(p)==wanted,'frozen input '+p)
offerpath=Path(args.offer).resolve();offer=json.loads(offerpath.read_bytes())
required={'tools/lib/ledger-months.mjs','tools/household-months.mjs','test/ledger-months.test.mjs','docs/LEDGER_MONTHS.md','src/ledger.ts'}
rows=offer['files'];need(len(rows)==5 and {r['path'] for r in rows}==required,'exact five offered rows')
candidate={}
for row in rows:
    p=Path(row['source_path']).resolve();i=identity(p)
    need(i['kind']=='file' and all(i[k]==row[k] for k in ('bytes','sha256','mode')),'offered identity '+row['path'])
    candidate[row['path']]=p
need(candidate['src/ledger.ts'].read_bytes()==(ROOT/'native-ledger.ts').read_bytes(),'unchanged original native module')
out=Path(args.output).resolve();out.mkdir(exist_ok=False)
runtime=out/'runtime';(runtime/'dist/src').mkdir(parents=True);(runtime/'tools/lib').mkdir(parents=True)
(runtime/'package.json').write_text('{"type":"module"}\n')
for rel in ['tools/lib/ledger-months.mjs','tools/household-months.mjs']:
    with (runtime/rel).open('xb') as f:f.write(candidate[rel].read_bytes())
    os.chmod(runtime/rel,0o644)
controls=list(map(Path,freeze['inputs']))+[ROOT/'freeze-v2.json',offerpath]
watched=set(controls)|set(candidate.values())
before=inventory(watched)
fixture_before={p.name:identity(p) for p in (ROOT/'fixtures').iterdir()}
need('missing.json' not in fixture_before,'missing input remains absent before course')
receipt={'schema':'hamon.root.household-months.receiving.v2','accepted':False,'started_ns':time.time_ns(),'scope':'Independent frozen12CLI cases plus one native monthly consumer on authored data; Node24 standard TS transform only, not tsc/npm/build/MCP/install. No product retries.','source_before':before,'commands':[]}
env={'PATH':'','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','NODE_NO_WARNINGS':'1'}
def command(name,argv,timeout=25):
    stdout=out/(name+'.stdout');stderr=out/(name+'.stderr');started=time.time_ns();timed=False;forced=False
    with stdout.open('xb') as so,stderr.open('xb') as se:
        child=subprocess.Popen(argv,cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=so,stderr=se,start_new_session=True)
        try:
            try:code=child.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed=True;os.killpg(child.pid,signal.SIGTERM)
                try:code=child.wait(timeout=2)
                except subprocess.TimeoutExpired:forced=True;os.killpg(child.pid,signal.SIGKILL);code=child.wait(timeout=2)
        except BaseException as interruption:
            cleanup=[]
            try:os.killpg(child.pid,signal.SIGTERM);cleanup.append('SIGTERM')
            except ProcessLookupError:cleanup.append('group already absent')
            try:child.wait(timeout=2)
            except subprocess.TimeoutExpired:
                try:os.killpg(child.pid,signal.SIGKILL);cleanup.append('SIGKILL')
                except ProcessLookupError:pass
                child.wait(timeout=2)
            try:os.killpg(child.pid,0);os.killpg(child.pid,signal.SIGKILL);cleanup.append('remaining group SIGKILL')
            except ProcessLookupError:pass
            receipt['commands'].append({'name':name,'argv':argv,'pid':child.pid,'exit':child.returncode,'interrupted':type(interruption).__name__,'cleanup':cleanup,'started_ns':started,'finished_ns':time.time_ns(),'prospective_stdout':str(stdout),'prospective_stderr':str(stderr)})
            raise
    try:os.killpg(child.pid,0);group_absent=False
    except ProcessLookupError:group_absent=True
    if not group_absent:
        forced=True
        try:os.killpg(child.pid,signal.SIGKILL)
        except ProcessLookupError:pass
    item={'name':name,'argv':argv,'pid':child.pid,'exit':code,'timeout':timed,'forced_cleanup':forced,'group_absent_on_return':group_absent,'started_ns':started,'finished_ns':time.time_ns(),'stdout':identity(stdout),'stderr':identity(stderr)}
    receipt['commands'].append(item)
    need(not timed and not forced and group_absent,'normal owned child closure '+name)
    return item,stdout.read_bytes(),stderr.read_bytes()
try:
    version=subprocess.run([args.node,'--version'],capture_output=True,env=env,timeout=5,check=True).stdout.decode().strip();need(version=='v24.19.0','recorded Node24.19.0 runtime');receipt['node']=version
    transformed,_,_=command('native-transform',[args.node,str(ROOT/'transform-native-v1.mjs'),str(ROOT/'native-ledger.ts'),str(runtime/'dist/src/ledger.js')])
    need(transformed['exit']==0,'native standard transform')
    runtime_paths=[p for p in runtime.rglob('*') if p.is_file() or p.is_symlink()];runtime_before=inventory(runtime_paths);receipt['runtime_before']=runtime_before
    spec=json.loads((ROOT/'cases-v1.json').read_bytes());results=[]
    for case in spec['cases']:
        item,so,se=command(case['name'],[args.node,str(runtime/'tools/household-months.mjs'),*case['argv']])
        passed=item['exit']==case['exit']
        if case['exit']==0:passed=passed and se==b'' and so==(ROOT/case['stdout']).read_bytes()
        else:passed=passed and so==b'' and len(se)>0
        results.append({'name':case['name'],'passed':passed,'expected_exit':case['exit'],'actual_exit':item['exit'],'stdout_bytes':len(so),'stderr_bytes':len(se)})
    receipt['cases']=results
    if next(r for r in results if r['name']=='mixed')['passed']:
        item,so,se=command('native-monthly',[args.node,str(ROOT/'use-discovered-month-v1.mjs'),str(runtime/'dist/src/ledger.js'),str(out/'mixed.stdout'),str(ROOT/'fixtures/mixed.json')])
        receipt['native_consumer']={'passed':item['exit']==0 and se==b'' and so==(ROOT/'oracles/native-monthly.stdout').read_bytes(),'month':'2026-01','currency':'USD'}
    else:receipt['native_consumer']={'passed':False,'reason':'mixed discovery failed; dependent consumer not run'}
    after=inventory(watched);runtime_after=inventory(runtime_paths);receipt['source_after']=after;receipt['runtime_after']=runtime_after
    need(after==before and runtime_after==runtime_before,'source/input/control/runtime unchanged')
    fixture_after={p.name:identity(p) for p in (ROOT/'fixtures').iterdir()};receipt['fixture_namespace_unchanged']=fixture_after==fixture_before
    need(fixture_after==fixture_before and 'missing.json' not in fixture_after,'exact fixture namespace and missing-file absence preserved')
    need(set(runtime_paths)=={p for p in runtime.rglob('*') if p.is_file() or p.is_symlink()},'no runtime file addition')
    receipt['accepted']=all(r['passed'] for r in results) and receipt['native_consumer']['passed']
except BaseException as e:
    receipt['error']={'type':type(e).__name__,'message':str(e),'traceback':traceback.format_exc()}
finally:
    receipt['finished_ns']=time.time_ns()
    with (out/'receipt.json').open('x') as f:json.dump(receipt,f,indent=2);f.write('\n')
print(json.dumps({'accepted':receipt['accepted'],'cases':len(receipt.get('cases',[])),'passed':sum(r['passed'] for r in receipt.get('cases',[])),'native_consumer':receipt.get('native_consumer'),'receipt':str(out/'receipt.json'),'commands':len(receipt['commands'])}))
raise SystemExit(0 if receipt['accepted'] else 1)
