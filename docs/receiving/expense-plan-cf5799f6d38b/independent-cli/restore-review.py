import base64,gzip,hashlib,json,pathlib,stat,sys
def pin(b):
 return {'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'git_blob':hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()}
w=json.loads(pathlib.Path(sys.argv[1]).read_text())
raw=gzip.decompress(base64.b64decode(w['payload_base64'],validate=True))
if pin(raw)!=w['uncompressed']:raise ValueError('Payload mismatch')
d=json.loads(raw);out=pathlib.Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=False)
links=[];files=[]
for r in d['entries']:
 rel=pathlib.PurePosixPath(r['path'])
 if rel.is_absolute() or '..' in rel.parts:raise ValueError('Unsafe path')
 if r['type']=='symlink-metadata':links.append(r);continue
 b=base64.b64decode(d['blobs'][r['sha256']],validate=True)
 if pin(b)!={k:r[k] for k in ('bytes','sha256','git_blob')}:raise ValueError('Byte identity mismatch')
 p=out.joinpath(*rel.parts);p.parent.mkdir(parents=True,exist_ok=True)
 with p.open('xb') as f:f.write(b)
 p.chmod(r['filesystem_mode'])
 if pin(p.read_bytes())!=pin(b) or stat.S_IMODE(p.stat().st_mode)!=r['filesystem_mode']:raise ValueError('Restore mismatch')
 files.append({k:r[k] for k in ('path','bytes','sha256','git_blob','mode','filesystem_mode')})
(out/'historical-symlink-metadata.json').write_text(json.dumps(links,ensure_ascii=True,indent=2)+'\n')
print(json.dumps({'restored_regular_files':len(files),'restored_bytes':sum(r['bytes'] for r in files),'historical_symlinks_as_metadata':len(links),'all_bytes_modes_sha_git_exact':True,'historical_inodes_recreated':False,'files':files}))
