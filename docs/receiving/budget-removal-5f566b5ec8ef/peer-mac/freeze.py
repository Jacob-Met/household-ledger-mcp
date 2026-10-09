from pathlib import Path
import json,hashlib,datetime
r=Path('D:/HAMON/household-budget-removal-peer-mac-5f566b5ec8ef');c=Path('D:/HAMON/household-budget-removal-5f566b5ec8ef/CONTRACT.json');p=r/'independent-expectations.json'
record={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'contractSha256':hashlib.sha256(c.read_bytes()).hexdigest(),'expectationsSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'groups':len(json.loads(p.read_text())['cases']),'candidateAccessBeforeFreeze':False}
(r/'freeze.json').write_text(json.dumps(record,indent=2)+'\n',encoding='utf-8');print(json.dumps(record))
