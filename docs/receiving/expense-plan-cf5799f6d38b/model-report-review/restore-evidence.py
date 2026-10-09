#!/usr/bin/env python3
import base64,gzip,hashlib,json,pathlib,stat,sys
source=pathlib.Path(__file__).with_name('raw-evidence.json.gz.b64')
payload=json.loads(gzip.decompress(base64.b64decode(source.read_bytes(),validate=False)))
assert payload['schema']=='household.model-peer.raw-archive.v1'
target=pathlib.Path(sys.argv[1]);target.mkdir(parents=True,exist_ok=False)
for row in payload['files']:
 rel=pathlib.PurePosixPath(row['path'])
 assert not rel.is_absolute() and '..' not in rel.parts
 blob=base64.b64decode(payload['streams'][row['sha256']],validate=True)
 assert len(blob)==row['bytes'] and hashlib.sha256(blob).hexdigest()==row['sha256']
 p=target.joinpath(*rel.parts);p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(blob);p.chmod(int(row['mode'],8))
 assert p.read_bytes()==blob and stat.S_IMODE(p.stat().st_mode)==int(row['mode'],8)
print(json.dumps({'restored_files':len(payload['files']),'unique_streams':len(payload['streams']),'target':str(target)}))
