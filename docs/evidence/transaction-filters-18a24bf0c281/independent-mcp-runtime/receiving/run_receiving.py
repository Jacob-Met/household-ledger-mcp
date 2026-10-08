#!/usr/bin/env python3
"""Build exact native source, then run the frozen independent read-only MCP receiver.
All fixture files remain; there is no cleanup or live ledger operation.
"""
import argparse, pathlib, json, subprocess, hashlib, sys, time

ROOT=pathlib.Path(__file__).resolve().parent.parent
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--variant", choices=["original","candidate"], required=True)
    p.add_argument("--run", required=True)
    a=p.parse_args()
    if not all(c.isalnum() or c in "_-" for c in a.run): raise ValueError("Unsafe run label")
    if (ROOT/"evidence"/a.run).exists(): raise RuntimeError("Fresh run name required")
    build_dir=ROOT/"evidence"/(a.run+"-build")
    build_dir.mkdir(exist_ok=False)
    started=time.time()
    command=["npm","run","build"]
    build=subprocess.run(command,cwd=ROOT/a.variant,capture_output=True,text=True,timeout=45)
    (build_dir/"stdout.log").write_text(build.stdout)
    (build_dir/"stderr.log").write_text(build.stderr)
    receipt={"command":command,"cwd":str(ROOT/a.variant),"returncode":build.returncode,"elapsed_seconds":time.time()-started,
             "package_lock_sha256":hashlib.sha256((ROOT/a.variant/"package-lock.json").read_bytes()).hexdigest()}
    (build_dir/"receipt.json").write_text(json.dumps(receipt,indent=2,sort_keys=True)+"\n")
    if build.returncode:
        print(json.dumps({"bootstrap_error":"maintained npm run build failed","receipt":receipt}),flush=True)
        return build.returncode
    command=["node",str(ROOT/"receiving/receive-filter.mjs"),a.variant,a.run]
    receive=subprocess.run(command,cwd=ROOT,capture_output=True,text=True,timeout=60)
    (build_dir/"receiver.stdout.log").write_text(receive.stdout)
    (build_dir/"receiver.stderr.log").write_text(receive.stderr)
    (build_dir/"receiver-command.json").write_text(json.dumps({"command":command,"returncode":receive.returncode},indent=2)+"\n")
    print(receive.stdout,end="",flush=True)
    if receive.stderr: print(receive.stderr,file=sys.stderr,end="",flush=True)
    return receive.returncode
if __name__=="__main__": raise SystemExit(main())
