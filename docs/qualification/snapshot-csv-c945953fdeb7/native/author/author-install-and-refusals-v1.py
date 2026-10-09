import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import time

STAGE = Path("/Users/me/Developer/household-snapshot-csv-c945953fdeb7")
TARGET = Path("/Users/me/Applications/HouseholdSnapshotCSV-c945953fdeb7")
PYTHON = "/Library/Frameworks/Python.framework/Versions/3.13/bin/python3"
CAP = 4 * 1024 * 1024
record = {"schema": "household-snapshot-csv-author-install-and-refusals/v1",
          "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "calls": [], "guards": [], "checks": [], "status": "running",
          "ordinary_csv_case_reserved_for_independent_receiving": True}
children = []


def identity(data):
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "git_blob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()}


def file_record(path):
    info = path.lstat()
    assert stat.S_ISREG(info.st_mode) and not path.is_symlink(), str(path)
    return {**identity(path.read_bytes()), "mode": oct(stat.S_IMODE(info.st_mode)),
            "mtime_ns": info.st_mtime_ns}


def inventory(root):
    return {str(path.relative_to(root)): file_record(path) for path in sorted(root.rglob("*")) if path.is_file()}


def guard():
    disk = shutil.disk_usage(STAGE).free
    result = subprocess.run(["/usr/bin/vm_stat"], capture_output=True, text=True, check=True, timeout=5)
    size = int(re.search(r"page size of (\d+) bytes", result.stdout).group(1))
    memory = sum(int(re.search(r"^" + re.escape(key) + r":\s+(\d+)", result.stdout, re.M).group(1))
                 for key in ("Pages free", "Pages inactive", "Pages speculative")) * size
    owned = sum(path.stat().st_size for root in (STAGE, TARGET) if root.exists()
                for path in root.rglob("*") if path.is_file())
    check = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
             "free_disk": disk, "conservative_memory": memory, "combined_owned_bytes": owned}
    record["guards"].append(check)
    assert disk >= 256 * 1024 * 1024 and memory >= 2 * 1024 ** 3 and owned + 131072 <= CAP, check


def run(name, argv):
    guard()
    start = time.monotonic()
    environment = dict(os.environ)
    environment.pop("NODE_OPTIONS", None)
    environment.pop("NODE_PATH", None)
    child = subprocess.Popen(argv, cwd="/tmp", env=environment, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    children.append(child)
    call = {"name": name, "argv": argv, "cwd": "/tmp", "pid": child.pid,
            "started_utc": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    record["calls"].append(call)
    try:
        stdout, stderr = child.communicate(timeout=30)
    except subprocess.TimeoutExpired:
        child.kill()
        stdout, stderr = child.communicate(timeout=5)
        call["timeout"] = True
    call.update({"exit": child.returncode, "elapsed_seconds": time.monotonic() - start,
                 "stdout": stdout.decode("utf-8", errors="replace"), "stderr": stderr.decode("utf-8", errors="replace"),
                 "stdout_bytes": len(stdout), "stderr_bytes": len(stderr),
                 "stdout_sha256": hashlib.sha256(stdout).hexdigest(), "stderr_sha256": hashlib.sha256(stderr).hexdigest()})
    assert len(stdout) <= 32768 and len(stderr) <= 32768, "Unexpected excessive child output"
    assert not call.get("timeout"), call
    return call


def write_new(path, data, mode=0o600):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, "wb") as handle:
        os.fchmod(handle.fileno(), mode)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    assert path.read_bytes() == data


os.umask(0o077)
exit_code = 1
try:
    guard()
    assert not os.path.lexists(TARGET)
    contract = file_record(STAGE / "independent-receiving-contract.md")
    assert contract["git_blob"] == "2012387eec7356f3035e85fd06d370ed163a7cc3"
    record["frozen_contract"] = contract
    preparation = json.loads((STAGE / "source-preparation-v1.json").read_text())
    source_before = inventory(STAGE / "source")
    assert source_before == preparation["source_files"]
    record["source_files_before"] = source_before
    intake = json.loads((STAGE / "native-original-intake.json").read_text())
    original_before = {item["path"]: file_record(STAGE / item["path"]) for item in intake["files"]}
    record["original_files_before"] = original_before
    for item in intake["files"]:
        assert all(original_before[item["path"]][key] == item[key] for key in ("bytes", "sha256", "git_blob", "mode"))
    installer_argv = [PYTHON, str(STAGE / "source/install.py"),
                      "--archive", str(STAGE / "original-qualified-owner-archive.tar.gz"),
                      "--destination", str(TARGET), "--owned-root", str(STAGE),
                      "--node", "/opt/homebrew/bin/node"]
    installation = run("exclusive-install", installer_argv)
    assert installation["exit"] == 0, installation
    record["installation_stdout"] = json.loads(installation["stdout"])
    marker = json.loads((TARGET / "INSTALLATION.json").read_text())
    installed_before = inventory(TARGET)
    record["installation_marker"] = marker
    record["installed_files_before_controls"] = installed_before
    assert len(installed_before) == 19
    assert marker["source_files"] == {path: {key: row[key] for key in ("bytes", "sha256", "git_blob")}
                                      for path, row in source_before.items()}
    for path, expected in marker["files"].items():
        assert installed_before[path] == expected, path
    assert installed_before["lib/ledger.js"]["git_blob"] == "003fe1cb4fbca02d9dc127804e7f31284192a197"
    assert installed_before["lib/transaction-export.js"]["git_blob"] == "ecf572a57c648ea2e74a1f2ee842503355581406"
    record["checks"].append("Actual exclusive installation completed; all 19 installed files and all retained originals/source identities match")
    invalid = STAGE / "author-invalid-ledger.json"
    output = STAGE / "author-invalid-output.csv"
    assert not os.path.lexists(output)
    write_new(invalid, b"{\n", 0o444)
    invalid_before = file_record(invalid)
    refused = run("installed-invalid-json-refusal", [str(TARGET / "household-snapshot-csv"),
                  "--ledger", str(invalid), "--output", str(output)])
    assert refused["exit"] == 2 and refused["stdout"] == "" and "valid JSON" in refused["stderr"], refused
    assert file_record(invalid) == invalid_before and not os.path.lexists(output)
    assert not list(STAGE.glob(".household-snapshot-csv-*.tmp"))
    record["invalid_input"] = invalid_before
    record["invalid_output_absent"] = True
    record["checks"].append("Actual installed command refused invalid JSON with exit 2; original invalid bytes unchanged and no output/stage published")
    refused_install = run("existing-installation-refusal", installer_argv)
    assert refused_install["exit"] == 1 and refused_install["stdout"] == "" and "Destination already exists" in refused_install["stderr"], refused_install
    record["checks"].append("Installer refused the real existing installed destination with exit 1")
    installed_after = inventory(TARGET)
    source_after = inventory(STAGE / "source")
    original_after = {item["path"]: file_record(STAGE / item["path"]) for item in intake["files"]}
    record.update({"installed_files_after_controls": installed_after, "source_files_after": source_after,
                   "original_files_after": original_after, "all_installed_source_and_original_files_unchanged": True})
    assert installed_before == installed_after and source_before == source_after and original_before == original_after
    guard()
    record["status"] = "pass"
    exit_code = 0
except BaseException as error:
    record["status"] = "fail"
    record["failure"] = {"type": type(error).__name__, "message": str(error)}
finally:
    for child in children:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=5)
    closure = []
    for child in children:
        result = subprocess.run(["/bin/ps", "-p", str(child.pid), "-o", "pid=,ppid=,pgid=,command="],
                                capture_output=True, text=True, timeout=5)
        closure.append({"pid": child.pid, "exit": child.returncode, "ps_exit": result.returncode,
                        "ps_stdout": result.stdout, "ps_stderr": result.stderr})
        if result.stdout.strip():
            record["status"] = "fail"
            record["closure_failure"] = "A recorded PID is currently present; inspect its current identity"
            exit_code = 1
    record["owned_child_closure"] = closure
    record["ended_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    data = (json.dumps(record, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    owned = sum(path.stat().st_size for root in (STAGE, TARGET) if root.exists()
                for path in root.rglob("*") if path.is_file())
    assert owned + len(data) <= CAP
    receipt_path = STAGE / "author-install-and-refusals-v1.json"
    write_new(receipt_path, data)
    print(json.dumps({"status": record["status"], "checks": record["checks"],
                      "receipt_path": str(receipt_path), "receipt": identity(data),
                      "calls": [{key: call.get(key) for key in ("name", "pid", "exit", "elapsed_seconds")}
                                for call in record["calls"]],
                      "child_census_empty": all(not item["ps_stdout"].strip() for item in closure),
                      "combined_owned_bytes_after_receipt": owned + len(data),
                      "failure": record.get("failure")}, separators=(",", ":")))
sys.exit(exit_code)
