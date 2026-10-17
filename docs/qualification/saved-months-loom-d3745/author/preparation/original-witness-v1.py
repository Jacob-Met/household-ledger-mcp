import datetime, hashlib, json, pathlib, stat, subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'original-observation-v1'
OUT.mkdir(exist_ok=False)
FIX = ROOT / 'fixtures-v1'
FIX.mkdir(exist_ok=False)

def identity(p):
    b = p.read_bytes()
    return {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest(), 'mode': stat.S_IMODE(p.stat().st_mode)}

def snapshot(root):
    return {p.relative_to(root).as_posix(): identity(p) for p in sorted(root.rglob('*')) if p.is_file()}

def tx(id, type, date, currency, category='Food', amount=100):
    return dict(id=id, type=type, amountMinor=amount, currency=currency, date=date, category=category,
                note='Authored Unicode café 雪; no real account', createdAt='retained raw label')

mixed = {'version': 2, 'transactions': [
    tx('same-id', 'expense', '2026-10-12', 'USD'),
    tx('same-id', 'income', '2026-10-01', 'usd'),
    tx('euro', 'expense', '2026-10-03', 'eUr'),
    tx('old', 'income', '1969-12-31', 'EUR'),
], 'budgets': [
    {'category': 'Travel', 'month': '2026-12', 'limitMinor': 200, 'currency': 'USD'},
    {'category': 'Rent', 'month': '2026-10', 'limitMinor': 200, 'currency': 'EUR'},
    {'category': 'Legacy', 'month': '2026-10', 'limitMinor': 0},
    {'category': 'Legacy', 'month': '0000-01', 'limitMinor': 0},
    {'category': 'Legacy', 'month': '0000-01', 'limitMinor': 0},
]}
compatible = {'version': 1, 'transactions': [
    tx('income', 'income', '2026-06-01', 'USD', 'Work', 1000),
    tx('expense', 'expense', '2026-06-02', 'USD', 'Food', 250),
], 'budgets': [{'category': 'Food', 'month': '2026-06', 'limitMinor': 300}]}
for name, value in [('mixed-ledger.json', mixed), ('compatible-ledger.json', compatible)]:
    (FIX/name).write_bytes((json.dumps(value, ensure_ascii=False, indent=2)+'\n').encode())
(FIX/'sentinel.txt').write_text('Preserve this unrelated file.\n')

started = datetime.datetime.now(datetime.timezone.utc).isoformat()
before = snapshot(ROOT/'original')
fixtures_before = snapshot(FIX)
absent_paths = ['tools/lib/ledger-months.mjs', 'tools/household-months.mjs', 'test/ledger-months.test.mjs', 'docs/LEDGER_MONTHS.md']
assert all(not (ROOT/'original'/p).exists() for p in absent_paths)
node = subprocess.run(['node', '--version'], capture_output=True, check=True)
cmd = ['node', 'tools/household-months.mjs', '--ledger', str(FIX/'mixed-ledger.json')]
p = subprocess.run(cmd, cwd=ROOT/'original', capture_output=True, timeout=10)
(OUT/'stdout.txt').write_bytes(p.stdout)
(OUT/'stderr.txt').write_bytes(p.stderr)
checks = {
    'missing_command_exit_one': p.returncode == 1,
    'missing_command_diagnostic': b'MODULE_NOT_FOUND' in p.stderr,
    'no_stdout': p.stdout == b'',
    'source_preserved': before == snapshot(ROOT/'original'),
    'fixtures_preserved': fixtures_before == snapshot(FIX),
    'paths_still_absent': all(not (ROOT/'original'/x).exists() for x in absent_paths),
}
receipt = {'schema': 'hamon.loom.household-months-original.v1', 'started': started,
    'finished': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'source_commit': '591ab6f5a2d65bf596aeb707dbb635ee981ec926',
    'node_version': node.stdout.decode().strip(), 'command': cmd, 'cwd': str(ROOT/'original'),
    'exit_code': p.returncode, 'stdout': identity(OUT/'stdout.txt'), 'stderr': identity(OUT/'stderr.txt'),
    'source_before': before, 'source_after': snapshot(ROOT/'original'),
    'fixtures_before': fixtures_before, 'fixtures_after': snapshot(FIX),
    'checks': checks, 'accepted_original_missing_command': all(checks.values()),
    'scope': 'Original absent-command witness and authored fixture freeze only; no candidate implementation or ledger function execution.'}
(OUT/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
assert all(checks.values()), checks
print(json.dumps({'accepted': True, 'checks': len(checks), 'receipt': identity(OUT/'receipt.json'), 'fixtures': fixtures_before}))
