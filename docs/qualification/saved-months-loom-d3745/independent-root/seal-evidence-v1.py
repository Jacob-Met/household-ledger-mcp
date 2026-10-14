"""Read retained independent observations and seal their original publication authority."""
import gzip, hashlib, io, json, os, stat, tarfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WORK = ROOT.parent
def require(value, message):
    if not value:
        raise ValueError(message)
def digest(body): return hashlib.sha256(body).hexdigest()
def encoded(value): return (json.dumps(value, indent=2, ensure_ascii=True) + '\n').encode()
def ident(path):
    path = Path(path); s = path.lstat()
    value = {'mode': stat.S_IMODE(s.st_mode), 'mtime_ns': s.st_mtime_ns,
             'kind': 'link' if path.is_symlink() else 'file'}
    if path.is_symlink(): value['target'] = os.readlink(path)
    else:
        require(stat.S_ISREG(s.st_mode), 'regular file ' + str(path))
        body = path.read_bytes(); value.update(bytes=len(body), sha256=digest(body))
    return value
def write(path, body):
    with path.open('xb') as f: f.write(body)

receipt_path = ROOT/'received-v2/receipt.json'
raw_receipt = receipt_path.read_bytes(); receipt = json.loads(raw_receipt)
require(receipt['accepted'] is True and receipt['node'] == 'v24.19.0', 'accepted recorded course')
require(receipt['source_before'] == receipt['source_after'], 'source custody')
require(receipt['runtime_before'] == receipt['runtime_after'], 'runtime custody')
require(receipt['fixture_namespace_unchanged'] is True, 'fixture custody')
for p, expected in receipt['source_after'].items(): require(ident(p) == expected, 'current source ' + p)
for p, expected in receipt['runtime_after'].items(): require(ident(p) == expected, 'current runtime ' + p)
spec = json.loads((ROOT/'cases-v1.json').read_bytes())
require(len(receipt['commands']) == 14 and len(receipt['cases']) == 12, 'exact course')
commands = {c['name']: c for c in receipt['commands']}
require(len(commands) == 14, 'unique commands')
for name, c in commands.items():
    require(c['group_absent_on_return'] and not c['timeout'] and not c['forced_cleanup'], 'normal closure ' + name)
    for stream in ('stdout', 'stderr'):
        require(ident(ROOT/'received-v2'/(name+'.'+stream)) == c[stream], 'raw stream ' + name)
recomputed = []
for case in spec['cases']:
    name = case['name']; command = commands[name]
    stdout = (ROOT/'received-v2'/(name+'.stdout')).read_bytes()
    stderr = (ROOT/'received-v2'/(name+'.stderr')).read_bytes()
    passed = command['exit'] == case['exit']
    passed = passed and (stdout == (ROOT/case['stdout']).read_bytes() and not stderr if case['exit'] == 0 else not stdout and bool(stderr))
    require(passed, 'independent exact result ' + name)
    recomputed.append({'name': name, 'passed': True, 'exit': command['exit']})
require(commands['native-monthly']['exit'] == 0 and not (ROOT/'received-v2/native-monthly.stderr').read_bytes(), 'native consumer exit')
require((ROOT/'received-v2/native-monthly.stdout').read_bytes() == (ROOT/'oracles/native-monthly.stdout').read_bytes(), 'whole native oracle')
require(not (ROOT/'fixtures/missing.json').exists(), 'missing selector stays absent')

# Compress the exact ten authored fixtures, including the literal symlink. No
# generated fixture is rerun; the archive is read back without extraction.
fixture_paths = sorted((ROOT/'fixtures').iterdir())
require(len(fixture_paths) == 10, 'ten fixture entries')
tarbuf = io.BytesIO(); fixture_index = []
with tarfile.open(fileobj=tarbuf, mode='w', format=tarfile.USTAR_FORMAT) as archive:
    for p in fixture_paths:
        original = ident(p); info = tarfile.TarInfo('fixtures/'+p.name)
        info.mode = original['mode']; info.mtime = 0; info.uid = info.gid = 0
        if p.is_symlink():
            info.type = tarfile.SYMTYPE; info.linkname = original['target']; archive.addfile(info)
        else:
            body = p.read_bytes(); info.size = len(body); archive.addfile(info, io.BytesIO(body))
        fixture_index.append({'path': info.name, 'original_identity': original})
compressed = gzip.compress(tarbuf.getvalue(), compresslevel=9, mtime=0)
write(ROOT/'fixtures-v1.tar.gz', compressed)
with tarfile.open(fileobj=io.BytesIO(compressed), mode='r:gz') as archive:
    require(archive.getnames() == [r['path'] for r in fixture_index], 'archive exact names')
    for row in fixture_index:
        member = archive.getmember(row['path']); original = row['original_identity']
        require(member.mode == original['mode'], 'archive mode')
        if original['kind'] == 'link': require(member.issym() and member.linkname == original['target'], 'archive symlink')
        else:
            body = archive.extractfile(member).read()
            require(member.isfile() and len(body) == original['bytes'] and digest(body) == original['sha256'], 'archive exact body')
write(ROOT/'fixture-archive-index-v1.json', encoded({'schema':'hamon.root.household-months.fixtures.v1', 'archive_sha256':digest(compressed), 'files':fixture_index, 'scope':'Exact original bytes/modes/link targets; archive timestamps normalized to zero. No extraction or product execution.'}))

offer = json.loads((WORK/'loom-household-months/candidate-five-path-offer-v1.json').read_bytes())
review = {'schema':'hamon.root.household-months.result-source-review.v1', 'reviewed_utc':datetime.now(timezone.utc).isoformat(), 'accepted':True,
          'receipt':{'bytes':len(raw_receipt), 'sha256':digest(raw_receipt)}, 'source_offer':offer,
          'results_recomputed':recomputed, 'native_consumer':'Actual discovered 2026-01/USD passed to unchanged native monthlySummary; complete 247-byte output equals manually prepared oracle.',
          'source_review':['Full four additive source/test/guide bodies read after candidate-blind oracle freeze. Complete original native validator independently authenticated before freeze.',
          'Complete native admission precedes exact month and normalized currency occurrence projection. No sums, invented months/currencies, deduplication, Store, mutation or account access.',
          'Required argument pair, read-only bounded regular-file admission, fatal UTF8, complete serialization and write-all error handling match the public contract.',
          'Guide distinguishes recorded keys from summary eligibility, warns against truncating the input through shell redirection, and accurately limits qualification to standard Node24 transform.'],
          'all_14_commands_closed_normally':True, 'all_watched_identities_preserved':True,
          'limits':['No full TypeScript compiler, npm suite, MCP/SDK, installation or real financial records course.',
                    'Root twelve CLI cases do not claim exhaustive help/duplicate-argument/FIFO/stdout-failure coverage or prove argument-before-access ordering.',
                    'Filesystem custody is before/after evidence, not continuous monitoring. No test or product replay during this audit.']}
write(ROOT/'result-source-review-v1.json', encoded(review))
readme = '''# Independent saved-month receiving — root d3745

The single frozen V2 course passed all twelve actual CLI cases and one dependent
unchanged native monthly-summary consumer. All fourteen owned commands closed
normally. Success output was compared in full against independently prepared
bytes; invalid input produced no success output. All watched source, fixtures,
controls and runtime files remained unchanged.

The V1 receiver was never executed. Anvil found two control gaps; the preserved
patch and V2 addendum resolve missing-file namespace custody and interrupted-child
cleanup without changing the twelve cases, helpers, expectations or time limits.
Candidate exposure followed Anvil's accepted V2 review. The original author
reporter-classification failure is separately retained by the author's capsule.

`fixtures-v1.tar.gz` preserves all ten original fixtures, including the literal
symlink, without storing repetitive tens of megabytes as loose Git objects.
`fixture-archive-index-v1.json` identifies each uncompressed entry. Archive
timestamps are normalized; original observed timestamps remain in the index and
frozen receipts. No product rerun occurred while sealing this evidence.

This is Node24 standard TypeScript transformation of the original native module,
not a full compiler/npm build, MCP session, installation or financial account
verification. Frozen absolute workspace paths describe the original execution;
copying these records elsewhere does not recreate that execution or its custody.
'''
write(ROOT/'README-publication.md', readme.encode())

selected = [
 'README-publication.md','prepare-oracles-v1.py','criteria-v1.md','cases-v1.json','native-ledger.ts',
 'transform-native-v1.mjs','use-discovered-month-v1.mjs','receive-v1.py','receive-v2.py',
 'freeze-v1.json','freeze-v2.json','controller-v1-to-v2.patch','controller-addendum-v2.md',
 'sentinel.txt','fixtures-v1.tar.gz','fixture-archive-index-v1.json','course-v2.stdout','course-v2.stderr',
 'result-source-review-v1.json','seal-evidence-v1.py','received-v2/receipt.json']
selected += ['oracles/'+p.name for p in sorted((ROOT/'oracles').iterdir())]
selected += ['received-v2/'+p.name for p in sorted((ROOT/'received-v2').iterdir()) if p.suffix in ('.stdout','.stderr')]
rows = []
def add(relative, p):
    body = p.read_bytes(); rows.append({'path':relative,'source_path':str(p), 'mode':'100644',
       'native_mode':stat.S_IMODE(p.stat().st_mode),'bytes':len(body),'sha256':digest(body),
       'git_blob':hashlib.sha1(b'blob '+str(len(body)).encode()+b'\0'+body).hexdigest()})
for name in selected: add(name, ROOT/name)
for name in ['public-oracle-custody-v1.json','freeze-audit-v1.json','controller-review-v2.json']:
    add('peer-review/'+name, WORK/'anvil/household-months-review'/name)
require(len({r['path'] for r in rows}) == len(rows), 'unique original selection')
descriptor = {'schema':'hamon.root.household-months.independent-publication.v1',
              'prefix':'docs/qualification/saved-months-loom-d3745/independent-root/', 'files':rows}
body = encoded(descriptor); write(ROOT/'publication-inputs-v1.json',body)
print(json.dumps({'accepted':True,'descriptor_bytes':len(body),'descriptor_sha256':digest(body),
                  'selected':len(rows),'payload_bytes':sum(r['bytes'] for r in rows),
                  'fixture_archive_bytes':len(compressed),'receipt_sha256':digest(raw_receipt)}))
