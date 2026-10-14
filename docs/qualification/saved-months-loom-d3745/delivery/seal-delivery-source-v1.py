"""Select the delivered finder companion's source and retained receiving records."""
import base64,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parent
WORK=ROOT.parent
LOOM=WORK/'loom-household-months'
OUT=ROOT/'delivery-source-v1'
PREFIX='docs/qualification/saved-months-loom-d3745/delivery/'
PARENT='4d7b36118967a2076fdf642f99da462a8bb862c1'
TREE='66484fbc6d0c72378ca6722bc853002f3e010394'
COMPANION=ROOT/'delivery-v1/Household-Saved-Month-Finder-20261014'
OUT.mkdir(exist_ok=False)
readme='''# Use the received saved-month finder

[Download the small runnable companion](https://drive.google.com/file/d/1qcpQE0ONgtsty5qTYAwivLKHyp8dW2J3/view), extract it fully, then open `OPEN-FIRST.html`. From that same folder, with Node.js installed:

```sh
node tools/household-months.mjs --ledger example/household.json
```

Supply an explicit existing saved-ledger path to inspect a different file. No npm install, compilation, MCP service or account connection is needed by this companion. The exact received runtime was observed with Node24.19.0 on Linux; other platforms were not separately received.

The [received example result](https://drive.google.com/file/d/1sR1UO0CAtflsmNRs0uvfUOFAbdv8ubyR/view) lists January through April2026:8 saved transaction occurrences,6 budget occurrences, including budget-only March. The [original consumer receipt](https://drive.google.com/file/d/19uyADMOSuulvL5o0JC6s68-4YNs8JP_2/view) retains the single completed invocation and all5 exact checks. These are synthetic historical qualification records, not account totals.

The ZIP is26,757bytes, SHA256`ab01744491a39e092c9d5e6b6f9333e666569caac9fa283b94d41e82741fea91`. Its14members contain13 manifest payloads: the exact six received runtime leaves, full example output, retained evidence and practical opening instructions. All bytes/modes/CRC and local links were checked without another product run; complete Drive download matched the built ZIP.

The CLI/helper remain the exact four-file source offer at`4d7b36118967a2076fdf642f99da462a8bb862c1`. The compiled native validator and sample retain qualified PR8`591ab6f5a2d65bf596aeb707dbb635ee981ec926` bytes. This additive evidence child changes no product path or earlier qualification and does not modify PR8's branch or README-only main. The receiving controller explicitly records that its expected retained-data output was authored after implementation; it is not relabeled candidate-blind.

The build script and original controller contain original workspace paths for provenance. They document this exact construction/observation; the runnable user entrypoint is inside the ZIP. No product execution, build, service restart or installation accompanies this source supplement.
'''
(OUT/'README.md').write_text(readme)
selected=[('README.md',OUT/'README.md'),('build-companion-v1.py',ROOT/'build-companion-v1.py'),('seal-delivery-source-v1.py',Path(__file__)),
 ('companion/OPEN-FIRST.html',COMPANION/'OPEN-FIRST.html'),('companion/README.txt',COMPANION/'README.txt'),('companion/MANIFEST.json',COMPANION/'MANIFEST.json'),
 ('companion/build-receipt-v1.json',ROOT/'delivery-v1/build-receipt-v1.json'),('companion/remote-readback-v1.json',ROOT/'delivery-v1/remote-companion-readback-v1.json'),
 ('consumer/receipt.json',LOOM/'retained-consumer-v1/receipt.json'),('consumer/discovered-months.json',LOOM/'retained-consumer-v1/discovered-months.json'),('consumer/stderr.txt',LOOM/'retained-consumer-v1/stderr.txt'),
 ('consumer/receive-retained-v1.py',LOOM/'retained-consumer-preparation-v1/receive-retained-v1.py'),('consumer/freeze-v1.json',LOOM/'retained-consumer-preparation-v1/freeze-v1.json'),('consumer/plan-v1.json',LOOM/'retained-consumer-preparation-v1/plan-v1.json'),('consumer/expected-discovery-v1.json',LOOM/'retained-consumer-preparation-v1/expected-discovery-v1.json'),
 ('consumer/publication-binding-v1.json',LOOM/'publication/retained-consumer-source-binding-v1.json'),('consumer/execution.stdout',LOOM/'publication/retained-consumer-execution-v1.stdout'),('consumer/execution.stderr',LOOM/'publication/retained-consumer-execution-v1.stderr'),
 ('reviews/anvil-retained-consumer-v1.json',WORK/'anvil/household-months-review/retained-consumer-review-v1.json'),('reviews/loom-companion-custody-v1.json',LOOM/'delivery/companion-custody-review-v1.json'),('reviews/root-remote-publication-v1.json',ROOT/'remote-publication-v1.json')]
rows=[];blobs={}
for rel,p in selected:
 b=p.read_bytes();oid=hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
 rows.append({'path':PREFIX+rel,'source_path':str(p.resolve()),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'git_blob':oid,'mode':'100644'})
 blobs[oid]={'sha':oid,'content':b.decode('utf8')}
descriptor={'schema':'hamon.root.household-delivery-source.v1','source_parent':PARENT,'parent_tree':TREE,'prefix':PREFIX,'files':rows}
raw=(json.dumps(descriptor,indent=2)+'\n').encode();(OUT/'original-selection-v1.json').open('xb').write(raw)
plan={'parent':PARENT,'parent_tree':TREE,'descriptor_sha256':hashlib.sha256(raw).hexdigest(),'blobs':list(blobs.values()),'tree_entries':[{'path':r['path'],'mode':r['mode'],'type':'blob','sha':r['git_blob']} for r in rows]}
(OUT/'plan-v1.json').open('x').write(json.dumps(plan,indent=2)+'\n')
print(json.dumps({'selected':len(rows),'unique_blobs':len(blobs),'payload_bytes':sum(r['bytes'] for r in rows),'descriptor_sha256':plan['descriptor_sha256']}))
