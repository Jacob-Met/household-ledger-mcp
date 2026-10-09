"""Independent two-call receiving of the installed saved-ledger CSV command."""
import csv
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import time
import traceback

ROOT = Path(__file__).resolve().parent
STAGE = Path("/Users/me/Developer/household-snapshot-csv-c945953fdeb7")
APP = Path("/Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7")
ENTRY = APP / "household-snapshot-csv"
CONTRACT_GIT = "2012387eec7356f3035e85fd06d370ed163a7cc3"
MARKER_GIT = "72ad7f6866e200910664bfc4cf385abe59b05c61"
AUTHOR_GIT = "343a733eae520fb3c28658d4138bbc8b78c10c14"
PREPARATION_GIT = "2bae55ac3645d8c6ef76d952af4090280bc79f31"
LEDGER_GIT = "64ae51bd94765295c5c5079829835ae584f49328"
CSV_GIT = "6cca2120e1381f89777d367b75cb9f1c868cc4cc"
DISK_FLOOR, MEMORY_FLOOR = 256*1024**2, 2*1024**3
OWN_CAP, AUTHOR_CAP = 512*1024, 4*1024**2
START = time.perf_counter()
r = {"schema":"household.snapshot-csv.independent.receiving.v1",
     "contract_git_blob":CONTRACT_GIT,"started_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
     "controller_pid":os.getpid(),"root":str(ROOT),"groups":[],"calls":[],"guards":[],"terminal":None}

def pin_bytes(b):
    return {"bytes":len(b),"sha256":hashlib.sha256(b).hexdigest(),
            "git_blob":hashlib.sha1(b"blob "+str(len(b)).encode()+b"\0"+b).hexdigest()}

def pin_file(p):
    p=Path(p);s=p.lstat()
    assert stat.S_ISREG(s.st_mode) and not p.is_symlink(),str(p)
    b=p.read_bytes()
    return {**pin_bytes(b),"mode":oct(stat.S_IMODE(s.st_mode)),"mtime_ns":s.st_mtime_ns}

def write_json(name,value):
    p=ROOT/name;p.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    with p.open("x",encoding="utf-8",newline="") as f:f.write(json.dumps(value,indent=2,ensure_ascii=False)+"\n")
    return p

def inventory(root):
    return {str(p.relative_to(root)):pin_file(p) for p in sorted(root.rglob("*")) if p.is_file() or p.is_symlink()}

def total(root):
    return sum(p.stat().st_size for p in root.rglob("*") if p.is_file()) if root.exists() else 0

def guard(label):
    v=subprocess.run(["/usr/bin/vm_stat"],capture_output=True,text=True,check=True,timeout=5)
    page=int(re.search(r"page size of (\d+) bytes",v.stdout).group(1))
    memory=page*sum(int(re.search(r"^"+re.escape(k)+r":\s+(\d+)",v.stdout,re.M).group(1))
                   for k in ("Pages free","Pages inactive","Pages speculative"))
    g={"label":label,"utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
       "free_disk":shutil.disk_usage(ROOT).free,"conservative_memory":memory,
       "receiver_owned_bytes":total(ROOT),"author_and_install_bytes":total(STAGE)+total(APP),
       "disk_floor":DISK_FLOOR,"memory_floor":MEMORY_FLOOR,
       "receiver_cap":OWN_CAP,"author_and_install_cap":AUTHOR_CAP}
    r["guards"].append(g)
    assert g["free_disk"]>=DISK_FLOOR and memory>=MEMORY_FLOOR,("native floor",g)
    assert g["receiver_owned_bytes"]<=OWN_CAP and g["author_and_install_bytes"]<=AUTHOR_CAP,("owned cap",g)
    assert time.perf_counter()-START<180,"receiver deadline"
    return g

def assert_pin(actual,expected):
    assert all(actual[k]==v for k,v in expected.items()),(actual,expected)

def group(name,details):
    item={"id":name,"passed":True,**details};r["groups"].append(item)
    write_json("groups/"+name+".json",item)
    print(name+" PASS",flush=True)

def run_entry(name,argv):
    guard("before "+name)
    started=time.perf_counter()
    call={"name":name,"argv":argv,"cwd":"/tmp","started_utc":datetime.datetime.now(datetime.timezone.utc).isoformat()}
    r["calls"].append(call)
    process=subprocess.Popen(argv,cwd="/tmp",stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    call["pid"]=process.pid
    error=None
    try:
        stdout,stderr=process.communicate(timeout=30)
    except BaseException as exc:
        call["receiver_stopped_owned_child"]=True
        process.kill()
        stdout,stderr=process.communicate(timeout=5)
        error=exc
    call.update({"exit":process.returncode,"elapsed_seconds":time.perf_counter()-started,
                 "stdout":pin_bytes(stdout),"stderr":pin_bytes(stderr)})
    for suffix,data in (("stdout",stdout),("stderr",stderr)):
        path=ROOT/"calls"/(name+"."+suffix+".txt")
        path.parent.mkdir(mode=0o700,exist_ok=True)
        with path.open("xb") as f:f.write(data)
    guard("after "+name)
    if error:raise error
    return call,stdout,stderr

def main():
    assert sys.platform=="darwin" and os.getuid()==501
    assert not (ROOT/"RECEIVING.json").exists(),"refuse repeated receiver execution"
    assert pin_file(ROOT/"CONTRACT.md")["git_blob"]==CONTRACT_GIT
    guard("before receiving")
    marker_bytes=(APP/"INSTALLATION.json").read_bytes()
    assert pin_bytes(marker_bytes)["git_blob"]==MARKER_GIT
    marker=json.loads(marker_bytes)
    assert marker["destination"]==str(APP) and marker["entry"]==str(ENTRY)
    assert marker["node"]["version"]=="v26.3.0" and marker["services_or_external_packages"]==[]
    author_path=STAGE/"author-install-and-refusals-v1.json"
    author_bytes=author_path.read_bytes()
    assert pin_bytes(author_bytes)["git_blob"]==AUTHOR_GIT
    author=json.loads(author_bytes)
    preparation_path=STAGE/"source-preparation-v1.json"
    prep_bytes=preparation_path.read_bytes()
    assert pin_bytes(prep_bytes)["git_blob"]==PREPARATION_GIT
    prep=json.loads(prep_bytes)
    assert author["status"]=="pass" and [c["exit"] for c in author["calls"]]==[0,2,1]
    assert author["ordinary_csv_case_reserved_for_independent_receiving"] is True
    assert author["all_installed_source_and_original_files_unchanged"] is True
    assert all(c["ps_exit"]==1 and not c["ps_stdout"] for c in author["owned_child_closure"])
    assert prep["contract"]["git_blob"]==CONTRACT_GIT
    assert prep["contract_retained_before_source_write_and_execution"] is True
    assert prep["private_draft_predated_contract_freeze"] is True
    assert prep["product_or_installer_invocations"]==0

    installed_before=inventory(APP)
    assert set(installed_before)==set(marker["files"])|{"INSTALLATION.json"}
    assert len(installed_before)==19 and sum(p["bytes"] for p in installed_before.values())==963062
    for name,expected in marker["files"].items():assert_pin(installed_before[name],expected)
    source_before=inventory(STAGE/"source")
    assert set(source_before)==set(marker["source_files"])
    for name,expected in marker["source_files"].items():assert_pin(source_before[name],expected)
    assert source_before==author["source_files_before"]==author["source_files_after"]
    original_before={name:pin_file(STAGE/name) for name in author["original_files_before"]}
    assert len(original_before)==12 and original_before==author["original_files_before"]==author["original_files_after"]
    assert set(inventory(STAGE/"originals"))=={p.removeprefix("originals/") for p in original_before if p.startswith("originals/")}
    node_before=pin_file(marker["node"]["resolved"])
    assert_pin(node_before,{k:marker["node"][k] for k in ("bytes","sha256","mtime_ns")})
    assert installed_before["lib/ledger.js"]["git_blob"]=="003fe1cb4fbca02d9dc127804e7f31284192a197"
    assert installed_before["lib/transaction-export.js"]["git_blob"]=="ecf572a57c648ea2e74a1f2ee842503355581406"
    before={"installation":installed_before,"source":source_before,"originals":original_before,
            "runtime":node_before,"author_receipt":pin_file(author_path),"source_preparation":pin_file(preparation_path)}
    write_json("before.json",before)
    r["authority"]={"installation_marker":pin_bytes(marker_bytes),"author_receipt":pin_bytes(author_bytes),
                    "source_preparation":pin_bytes(prep_bytes),"source_review_complete":True,
                    "original_modules_unchanged":True,"author_cases_rerun":False}

    ledger=STAGE/"originals/ordinary/ledger.json"
    expected=STAGE/"originals/ordinary/expected.csv"
    assert pin_file(ledger)["git_blob"]==LEDGER_GIT and pin_file(ledger)["mode"]=="0o444"
    expected_bytes=expected.read_bytes()
    assert pin_bytes(expected_bytes)=={"bytes":976,"sha256":"24113776afdf40feea50b26dfee4170ed850dd0851b8e7b6cefff7616e095be2","git_blob":CSV_GIT}
    delivery=ROOT/"delivery";delivery.mkdir(mode=0o700)
    output=delivery/"statement.csv"
    assert not os.path.lexists(output)
    argv=[str(ENTRY),"--ledger",str(ledger),"--output",str(output)]
    call,stdout,stderr=run_entry("F1-new-output",argv)
    assert call["exit"]==0,(call,stdout,stderr)
    physical=output.read_bytes()
    assert physical==expected_bytes
    rows=list(csv.reader(io.StringIO(physical.decode("utf-8"),newline=""),strict=True))
    columns=["id","type","amountMinor","currency","date","category","note","idempotencyKey","createdAt"]
    ids=["newest-income",'id,alpha"🧭',"tie-second","legacy-tie","lowercase-category","constructor-row","seasonal","oldest"]
    assert rows[0]==columns and len(rows)==9 and all(len(row)==9 for row in rows)
    assert [row[0] for row in rows[1:]]==ids and physical.endswith(b"\r\n")
    result=json.loads(stdout)
    assert result["format"]=="household-snapshot-csv" and result["version"]==1 and result["selectors"]=={}
    assert result["source"]=={"path":str(ledger),"bytes":2405,"sha256":"ca1602b160685b5605c84390e60338c4e5317238d0a8ccf6f24a55bacba37f09"}
    assert result["output"]=={"path":str(output),"rowCount":8,"byteCount":976,"sha256":pin_bytes(physical)["sha256"]}
    assert {p.name for p in delivery.iterdir()}=={"statement.csv"}
    output_before=pin_file(output)
    group("F1_installed_physical_csv",{"child":call,"actual_receipt":result,"output":output_before,
          "exact_original_expected_bytes":True,"rows":8,"columns":columns,"ordered_ids":ids,
          "expected_csv_regenerated":False,"source_path":str(ledger),"output_path":str(output)})

    call2,stdout2,stderr2=run_entry("F2-existing-output",argv)
    assert call2["exit"]==1,(call2,stdout2,stderr2)
    diagnostic=json.loads(stderr2)
    assert "Output already exists" in diagnostic["error"] and str(output) in diagnostic["error"]
    assert pin_file(output)==output_before
    assert {p.name for p in delivery.iterdir()}=={"statement.csv"}
    group("F2_existing_output_refusal",{"child":call2,"actual_diagnostic":diagnostic,
          "physical_output_unchanged":True,"no_surviving_owned_stage":True,"output":pin_file(output)})

    after={"installation":inventory(APP),"source":inventory(STAGE/"source"),
           "originals":{name:pin_file(STAGE/name) for name in original_before},
           "runtime":pin_file(marker["node"]["resolved"]),
           "author_receipt":pin_file(author_path),"source_preparation":pin_file(preparation_path)}
    write_json("after.json",after)
    assert after==before
    closure=[]
    for call in r["calls"]:
        ps=subprocess.run(["/bin/ps","-p",str(call["pid"]),"-o","pid=,ppid=,comm="],
                          capture_output=True,text=True,timeout=5)
        item={"pid":call["pid"],"actual_child_exit":call["exit"],"ps_exit":ps.returncode,
              "ps_stdout":ps.stdout,"ps_stderr":ps.stderr}
        closure.append(item)
        assert ps.returncode==1 and ps.stdout.strip()=="",item
    assert len(r["calls"])==2
    guard("after preservation and owned child closure")
    group("F3_preservation_and_closure",{"installed_files_unchanged":19,"source_files_unchanged":8,
          "offered_original_files_unchanged":12,"runtime_and_author_receipts_unchanged":True,
          "comparison":"exact bytes, SHA256, Git identity, mode and mtime_ns",
          "owned_child_closure":closure,"actual_product_calls":2,"services_or_browsers_started":0,
          "output":pin_file(output),"delivery_directory_names":[p.name for p in delivery.iterdir()]})
    r["terminal"]={"passed":True,"exit":0}

def deadline(signum,frame):
    raise TimeoutError("Independent receiving exceeded its 180 second bound")

os.umask(0o077)
signal.signal(signal.SIGALRM,deadline)
signal.alarm(180)
try:
    main()
except BaseException as exc:
    r["terminal"]={"passed":False,"exit":1,"error":repr(exc),"traceback":traceback.format_exc()}
    traceback.print_exc()
finally:
    signal.alarm(0)
    r["finished_utc"]=datetime.datetime.now(datetime.timezone.utc).isoformat()
    r["elapsed_seconds"]=time.perf_counter()-START
    r["files_before_final_receipt"]=inventory(ROOT)
    r["self_exclusion"]="RECEIVING.json excludes itself; outer logs and actual controller close follow separately."
    write_json("RECEIVING.json",r)
    print(json.dumps({"terminal":r["terminal"],"groups":[g["id"] for g in r["groups"]],
                      "receipt":str(ROOT/"RECEIVING.json"),"receipt_pin":pin_file(ROOT/"RECEIVING.json")}),flush=True)
raise SystemExit(r["terminal"]["exit"])
