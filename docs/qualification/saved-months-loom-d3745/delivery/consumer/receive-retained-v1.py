"""One retained-ledger CLI observation; invoke only after source publication."""
from pathlib import Path
import datetime
import hashlib
import json
import os
import stat
import subprocess
import sys

BASE = Path(__file__).resolve().parent.parent
PREP = BASE / 'retained-consumer-preparation-v1'


def identity(path):
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode):
        raise ValueError(f'not a regular file: {path}')
    body = path.read_bytes()
    return {'bytes': len(body), 'sha256': hashlib.sha256(body).hexdigest(),
            'mode': stat.S_IMODE(s.st_mode)}


def namespace(root):
    result = {}
    for path in sorted(root.rglob('*')):
        relative = path.relative_to(root).as_posix()
        s = path.lstat()
        if stat.S_ISDIR(s.st_mode):
            result[relative] = {'type': 'directory', 'mode': stat.S_IMODE(s.st_mode)}
        elif stat.S_ISREG(s.st_mode):
            result[relative] = {'type': 'file', **identity(path)}
        else:
            raise ValueError(f'unexpected input type: {path}')
    return result


def main():
    if len(sys.argv) != 2:
        raise ValueError('supply the exact publication-binding JSON path')
    binding_path = Path(sys.argv[1]).resolve()
    binding = json.loads(binding_path.read_text())
    if binding.get('repository') != 'Jacob-Met/household-ledger-mcp':
        raise ValueError('wrong repository')
    source_commit = binding['source_commit']
    if len(source_commit) != 40 or any(c not in '0123456789abcdef' for c in source_commit):
        raise ValueError('expected immutable source commit')
    if binding.get('remote_bytes_verified') is not True:
        raise ValueError('publication full-byte readback is required')
    freeze = json.loads((PREP / 'freeze-v1.json').read_text())
    before_controls = {row['path']: identity(Path(row['source_path'])) for row in freeze['controls']}
    expected_controls = {row['path']: {k: row[k] for k in ('bytes', 'sha256', 'mode')} for row in freeze['controls']}
    if before_controls != expected_controls:
        raise ValueError('frozen controls differ')
    runtime = BASE / 'retained-runtime-v1'
    before_runtime = namespace(runtime)
    if before_runtime != freeze['runtime_namespace']:
        raise ValueError('offered runtime differs from freeze')
    for path in ('tools/household-months.mjs', 'tools/lib/ledger-months.mjs'):
        if identity(runtime / path) != {k: binding['source_files'][path][k] for k in ('bytes', 'sha256', 'mode')}:
            raise ValueError(f'published source differs: {path}')
    output = BASE / 'retained-consumer-v1'
    output.mkdir(exist_ok=False)
    command = ['node', 'tools/household-months.mjs', '--ledger', 'example/household.json']
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    process = subprocess.run(command, cwd=runtime, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             timeout=30, check=False)
    (output / 'discovered-months.json').write_bytes(process.stdout)
    (output / 'stderr.txt').write_bytes(process.stderr)
    after_runtime = namespace(runtime)
    after_controls = {row['path']: identity(Path(row['source_path'])) for row in freeze['controls']}
    checks = [
        {'name': 'exit zero', 'actual': process.returncode, 'expected': 0},
        {'name': 'empty stderr', 'actual': process.stderr.hex(), 'expected': ''},
        {'name': 'complete exact manually prepared output', 'actual': process.stdout.hex(),
         'expected': (PREP / 'expected-discovery-v1.json').read_bytes().hex()},
        {'name': 'complete runtime namespace preserved', 'actual': after_runtime, 'expected': before_runtime},
        {'name': 'historical inputs and frozen controls preserved', 'actual': after_controls, 'expected': before_controls},
    ]
    for check in checks:
        check['pass'] = check['actual'] == check['expected']
    receipt = {
        'schema': 'hamon.loom.household-retained-months.v1',
        'started_at': started, 'finished_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'source_commit': source_commit, 'publication_binding': identity(binding_path),
        'qualified_parent': '591ab6f5a2d65bf596aeb707dbb635ee981ec926',
        'scope': 'One saved synthetic ledger discovery using its retained emitted native validator; distinct from the Node 24 TypeScript-transform courses. No import, summary, build, installation or service was rerun.',
        'expectation_timing': 'Authored from the complete retained ledger after implementation, before this invocation; this is an author consumer, not candidate-blind independent receiving.',
        'command': command, 'cwd': str(runtime), 'exit_code': process.returncode,
        'stdout': identity(output / 'discovered-months.json'), 'stderr': identity(output / 'stderr.txt'),
        'checks': checks, 'accepted': all(c['pass'] for c in checks),
    }
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2, ensure_ascii=True) + '\n')
    print(json.dumps({'accepted': receipt['accepted'], 'checks': len(checks), 'receipt': str(output / 'receipt.json')}))
    return 0 if receipt['accepted'] else 1


if __name__ == '__main__':
    sys.exit(main())
