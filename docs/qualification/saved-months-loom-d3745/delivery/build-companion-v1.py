"""Package the exact received offline finder; no compiler or product invocation."""
import hashlib, html, json, stat, zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parent
WORK=ROOT.parent
LOOM=WORK/'loom-household-months'
RUNTIME=LOOM/'retained-runtime-v1'
OUT=ROOT/'delivery-v1'
SOURCE='4d7b36118967a2076fdf642f99da462a8bb862c1'
PARENT='591ab6f5a2d65bf596aeb707dbb635ee981ec926'
TITLE='Household-Saved-Month-Finder-20261014'
def need(ok,why):
    if not ok: raise ValueError(why)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(value):return (json.dumps(value,indent=2,ensure_ascii=True)+'\n').encode()
def ident(p):
    s=p.lstat();need(stat.S_ISREG(s.st_mode),'regular package source')
    b=p.read_bytes();return {'bytes':len(b),'sha256':sha(b),'mode':stat.S_IMODE(s.st_mode)}

freeze=json.loads((LOOM/'retained-consumer-preparation-v1/freeze-v1.json').read_bytes())
consumer_path=LOOM/'retained-consumer-v1/receipt.json'
consumer=json.loads(consumer_path.read_bytes())
need(consumer['source_commit']==SOURCE and consumer['accepted'] and len(consumer['checks'])==5,'qualified retained consumer')
need(all(c['pass'] and c['actual']==c['expected'] for c in consumer['checks']),'all original consumer checks')
remote=json.loads((ROOT/'remote-publication-v1.json').read_bytes())
need(remote['accepted'] and remote['commit']==SOURCE,'fresh remote source verified')
report_raw=(LOOM/'retained-consumer-v1/discovered-months.json').read_bytes()
need(report_raw==(LOOM/'retained-consumer-preparation-v1/expected-discovery-v1.json').read_bytes(),'whole received result')
report=json.loads(report_raw)
need(report['counts']=={'transactions':8,'budgets':6,'months':4},'four recorded example months')
peer=WORK/'anvil/household-months-review/retained-consumer-review-v1.json'
need(sha(peer.read_bytes())=='429febb7584ff5cea7a7c221e1f915378e8d9381f3ef7e606d1d328a2bc1a382','independent original consumer review')

payload={};origins={}
for rel,row in freeze['runtime_namespace'].items():
    p=RUNTIME/rel
    if row['type']=='directory':need(p.is_dir() and stat.S_IMODE(p.stat().st_mode)==row['mode'],'runtime directory');continue
    need(ident(p)=={k:row[k] for k in ('bytes','sha256','mode')},'exact received runtime '+rel)
    payload[rel]=p.read_bytes();origins[rel]={'source_path':str(p),'source_commit':SOURCE if rel.startswith('tools/') else PARENT}
need(len(payload)==6,'six runtime leaves only')
actual={p.relative_to(RUNTIME).as_posix() for p in RUNTIME.rglob('*') if p.is_file()}
need(actual==set(payload),'exact received runtime file set')
extras={'example/discovered-months.json':LOOM/'retained-consumer-v1/discovered-months.json',
        'evidence/retained-consumer-receipt.json':consumer_path,
        'evidence/independent-consumer-review.json':peer,
        'evidence/remote-source-verification.json':ROOT/'remote-publication-v1.json',
        'evidence/build-companion-v1.py':Path(__file__)}
for rel,p in extras.items():payload[rel]=p.read_bytes();origins[rel]={'source_path':str(p)}

readme=f'''# Household saved-month finder

Extract this ZIP completely into its own folder. Open OPEN-FIRST.html for the
short visual guide. The folder containing OPEN-FIRST.html is the command root.

Requires an existing Node.js installation. This exact runtime was received on
Linux with Node 24.19.0; no additional npm packages or compilation are needed.
Other operating systems/Node versions were not separately received here.

From a terminal in the extracted folder:

    node tools/household-months.mjs --ledger example/household.json

The included saved synthetic example has four recorded months, eight transaction
occurrences and six budget occurrences. March 2026 is budget-only. The complete
received output is example/discovered-months.json.

For your own existing saved Household Ledger file, supply its path explicitly:

    node tools/household-months.mjs --ledger "/absolute/path/to/ledger.json"

The command reads one saved file and prints JSON. It does not initialize, repair,
change or upload the ledger, start an MCP server, or connect to an account. It
lists recorded month keys and currency/row counts; these are not monetary totals,
deduplicated purchases or evidence that an account is complete. Legacy budgets
without a currency remain unassigned. A true summary_supported flag describes
the existing summary's year range only; other native summary rules still apply.

Normal success is exit 0, including an empty valid ledger. Invalid arguments,
missing/nonregular files, invalid native data, invalid UTF-8/JSON, inputs over
16 MiB or over 100,000 combined rows, and ordinary output failures exit 2. A
failed output sink may contain partial JSON. Never redirect stdout into the
ledger itself: the shell would truncate it before this command reads it. If
saving a report, choose a different new output path deliberately.

## Exact source composition

New CLI/helper: {SOURCE}
https://github.com/Jacob-Met/household-ledger-mcp/pull/40

The existing emitted validator, ESM marker and saved synthetic example are
retained from qualified PR8 {PARENT}. This package reuses those exact received
bytes; it does not rebuild the validator or claim main/PR8 adoption. The LICENSE
is retained from the same complete source. The new source is a stacked draft
offer over PR8; the repository's separate README-only main remains unchanged.

Qualification: twelve independent CLI cases plus a discovered-month native
consumer; separately one invocation on this exact retained six-file runtime
matched the entire expected result and preserved every input. Anvil independently
reviewed that retained result without another execution. Packaging verified all
ZIP member bytes/modes/CRC without rerunning the command. Original evidence lives
under evidence/. Its absolute workspace paths describe the original observation.

No full compiler/npm suite, MCP/SDK, installation, account or Windows receiving
is claimed. The only supported use represented by this companion is the explicit
offline saved-file command above.
'''
payload['README.txt']=readme.encode();origins['README.txt']={'generated_from':'Exact received runtime and qualified source boundaries'}
table=''.join('<tr><td>'+html.escape(r['month'])+'</td><td>'+str(r['transaction_count'])+'</td><td>'+str(r['budget_count'])+'</td><td>'+html.escape(', '.join(c['currency'] for c in r['currencies']))+'</td></tr>' for r in report['months'])
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Household · Find a recorded month</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f3f5ef;color:#18302b;font:17px/1.55 system-ui,sans-serif}main{max-width:940px;margin:auto;padding:clamp(24px,5vw,64px) clamp(18px,4vw,48px)}.eyebrow{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#4d6c61}h1{font-size:clamp(32px,5vw,52px);line-height:1.06;letter-spacing:-.035em;margin:14px 0 22px}h2{font-size:24px;margin:0 0 14px}.intro{font-size:20px;max-width:710px}.card{background:white;border:1px solid #dce4da;border-radius:16px;padding:clamp(18px,3vw,28px);margin-top:24px}pre{background:#17382f;color:#edf7df;padding:18px;border-radius:10px;white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.7 ui-monospace,monospace}code{font-family:ui-monospace,monospace;font-size:.88em;overflow-wrap:anywhere}a{color:#126546;text-underline-offset:3px}table{border-collapse:collapse;width:100%;font-size:15px}th,td{text-align:left;padding:12px 8px;border-bottom:1px solid #e0e6dd}th{color:#547165;font-size:13px}tr:nth-child(3){background:#eff6d9}.note{color:#557064;font-size:14px}summary{cursor:pointer;font-weight:650}details p{font-size:15px}.tag{display:inline-block;background:#e3edd5;padding:4px 10px;border-radius:20px;font-size:13px}</style>
<main><div class="eyebrow">Household Ledger · Offline companion · 14 October 2026</div><h1>Find a recorded month.<br>Then choose what to review.</h1><p class="intro">See which months and currencies occur in one saved Household ledger—including months with budgets and no transactions.</p><span class="tag">Read-only saved-file command</span>
<section class="card"><h2>1. Open the example</h2><p>Extract the whole ZIP. With Node.js installed, open a terminal in the folder containing this page and run:</p><pre>node tools/household-months.mjs --ledger example/household.json</pre><p class="note">No npm install or build step. This exact runtime was received on Linux with Node 24.19.0.</p></section>
<section class="card"><h2>Four months in the saved example</h2><p>The included synthetic ledger contains eight transaction occurrences and six budget occurrences. March has a budget without a transaction.</p><table><thead><tr><th>Month</th><th>Transactions</th><th>Budgets</th><th>Currencies</th></tr></thead><tbody>'''+table+'''</tbody></table><p><a href="example/discovered-months.json">Open the complete received JSON</a></p></section>
<section class="card"><h2>2. Select your saved ledger</h2><p>Replace the quoted path with your existing Household Ledger JSON file:</p><pre>node tools/household-months.mjs --ledger "/absolute/path/to/ledger.json"</pre><p>The command prints JSON and leaves the input unchanged. It counts saved rows without adding missing months, converting currencies or totaling amounts.</p><p class="note">If saving stdout, use a different, new destination. Never redirect it into the input ledger.</p></section>
<section class="card"><details><summary>Source, limits and qualification</summary><p>The CLI/helper are published in <a href="https://github.com/Jacob-Met/household-ledger-mcp/pull/40">Household PR 40</a> at <code>'''+SOURCE+'''</code>. The emitted validator and synthetic example retain their exact qualified PR8 bytes. This companion does not imply main-branch adoption or an installed MCP service.</p><p>Recorded keys and occurrence counts are not balances or account completeness. <code>summary_supported</code> checks the existing summary's year range only; native currency/budget rules still apply. Inputs are limited to 16 MiB and 100,000 combined rows.</p><p>The retained runtime completed one exact-output observation with input preservation. Independent review checked that result. Packaging checked every ZIP member without another product run. Other platforms and Node versions were not separately received.</p><p><a href="README.txt">Full instructions and recovery notes</a> · <a href="evidence/retained-consumer-receipt.json">Original receiving receipt</a> · <a href="evidence/independent-consumer-review.json">Independent result review</a></p></details></section></main></html>
'''
payload['OPEN-FIRST.html']=page.encode();origins['OPEN-FIRST.html']={'generated_from':'Received four-month result and exact runtime instructions'}
manifest={'schema':'hamon.household-saved-month-finder.companion.v1','title':TITLE,'source_commit':SOURCE,'qualified_parent':PARENT,
          'files':[{'path':rel,'bytes':len(raw),'sha256':sha(raw),'mode':420,'origin':origins[rel]} for rel,raw in sorted(payload.items())],
          'scope':'Runnable offline companion of the exact received six-file runtime; source and qualification boundaries remain explicit.'}
payload['MANIFEST.json']=encode(manifest)
OUT.mkdir(exist_ok=False)
folder=OUT/TITLE;folder.mkdir()
for rel,raw in payload.items():
    p=folder/rel;p.parent.mkdir(parents=True,exist_ok=True);p.open('xb').write(raw);p.chmod(0o644)
zip_path=OUT/(TITLE+'.zip')
with zipfile.ZipFile(zip_path,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
    for rel,raw in sorted(payload.items()):
        z=zipfile.ZipInfo(TITLE+'/'+rel,date_time=(2026,10,14,0,0,0));z.create_system=3;z.external_attr=(stat.S_IFREG|0o644)<<16;z.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(z,raw)
with zipfile.ZipFile(zip_path) as archive:
    need(archive.testzip() is None,'archive CRC')
    need(set(archive.namelist())=={TITLE+'/'+rel for rel in payload},'exact archive namespace')
    for rel,raw in payload.items():
        info=archive.getinfo(TITLE+'/'+rel);need(archive.read(info)==raw and stat.S_IMODE(info.external_attr>>16)==0o644,'complete member bytes/mode')
receipt={'schema':'hamon.root.household-companion.build.v1','accepted':True,'created_utc':datetime.now(timezone.utc).isoformat(),
         'zip':{'path':str(zip_path.resolve()),**ident(zip_path)},'members':len(payload),'received_runtime_files':6,
         'manifest_sha256':sha(payload['MANIFEST.json']),'consumer_receipt':ident(consumer_path),'independent_review':ident(peer),
         'scope':'Read-only retained receipt/runtime admission and complete archive member/CRC/mode verification. No product rerun or new compiler/native installation.'}
(OUT/'build-receipt-v1.json').open('xb').write(encode(receipt))
print(json.dumps(receipt))
