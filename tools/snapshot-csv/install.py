#!/usr/bin/env python3
"""Install the explicit saved-file CSV command using the original qualified modules."""
import argparse
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tarfile

ARCHIVE_BYTES = 861340
ARCHIVE_SHA256 = "1213482711354e8a44f35230dd8d41061ad2cb3f868421075c705318cf9752f0"
SOURCE_FILES = (
    "install.py", "launcher.sh.in", "snapshot-csv.mjs", "README.md", "INPUTS.json",
    "lib/package.json", "lib/ledger.js", "lib/transaction-export.js",
)
CAP = 4 * 1024 * 1024
DISK_FLOOR = 256 * 1024 * 1024
MEMORY_FLOOR = 2 * 1024 ** 3


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def identity(data):
    return {
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "git_blob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(),
    }


def read_regular(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    with os.fdopen(fd, "rb") as handle:
        before = os.fstat(handle.fileno())
        require(stat.S_ISREG(before.st_mode), "Expected a regular file: " + str(path))
        require(before.st_size <= limit, "Input exceeds its admission limit: " + str(path))
        data = handle.read(limit + 1)
        after = os.fstat(handle.fileno())
    require(
        len(data) == before.st_size and
        (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns) ==
        (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
        "Input changed during admission: " + str(path),
    )
    return data


def owned_size(root):
    total = 0
    for path in root.rglob("*"):
        info = path.lstat()
        require(not stat.S_ISLNK(info.st_mode), "Owned tree contains a symbolic link: " + str(path))
        if stat.S_ISREG(info.st_mode):
            total += info.st_size
        else:
            require(stat.S_ISDIR(info.st_mode), "Owned tree contains a special file: " + str(path))
    return total


def capacity(root):
    require(sys.platform == "darwin", "This installer is for the admitted Mac installation")
    disk = shutil.disk_usage(root).free
    result = subprocess.run(["/usr/bin/vm_stat"], capture_output=True, text=True, check=True, timeout=5)
    page_size = int(re.search(r"page size of (\d+) bytes", result.stdout).group(1))
    pages = sum(int(re.search(r"^" + re.escape(key) + r":\s+(\d+)", result.stdout, re.M).group(1))
                for key in ("Pages free", "Pages inactive", "Pages speculative"))
    memory = pages * page_size
    require(disk >= DISK_FLOOR, "Free disk is below the 256 MiB installation floor")
    require(memory >= MEMORY_FLOOR, "Conservative available RAM is below the 2 GiB installation floor")
    return {"free_disk": disk, "conservative_memory": memory, "disk_floor": DISK_FLOOR, "memory_floor": MEMORY_FLOOR}


def write_new(path, data, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, mode)
    with os.fdopen(fd, "wb") as handle:
        os.fchmod(handle.fileno(), mode)
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    require(path.read_bytes() == data, "Installed readback differs: " + str(path))


def install(args):
    source = Path(__file__).resolve().parent
    owned = Path(args.owned_root).absolute()
    destination = Path(args.destination).absolute()
    require(owned.is_dir() and not owned.is_symlink(), "--owned-root must be an existing ordinary directory")
    owned = owned.resolve()
    source.relative_to(owned)
    require(destination.parent.is_dir(), "The destination parent must already exist")
    destination = destination.parent.resolve() / destination.name
    require(not destination.is_relative_to(owned) and not owned.is_relative_to(destination),
            "The destination and existing owned preparation tree must be separate")
    require(not os.path.lexists(destination), "Destination already exists: " + str(destination))
    admitted_capacity = capacity(owned)
    sources = {name: read_regular(source / name, 256 * 1024) for name in SOURCE_FILES}
    inputs = json.loads(sources["INPUTS.json"].decode("utf-8"))
    require(inputs["archive"]["bytes"] == ARCHIVE_BYTES and
            inputs["archive"]["sha256"] == ARCHIVE_SHA256, "Input provenance does not match the original archive")
    archive = read_regular(Path(args.archive), ARCHIVE_BYTES)
    require(len(archive) == ARCHIVE_BYTES and hashlib.sha256(archive).hexdigest() == ARCHIVE_SHA256,
            "Archive is not the exact qualified original")
    selected = {}
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as package:
        members = package.getmembers()
        require(len(members) == 365 and len({member.name for member in members}) == len(members),
                "Unexpected original archive member inventory")
        for name, pin in inputs["selected_members"].items():
            member = package.getmember(name)
            require(member.isfile() and member.size == pin["bytes"], "Unexpected selected member: " + name)
            data = package.extractfile(member).read(pin["bytes"] + 1)
            require(identity(data) == {key: pin[key] for key in ("bytes", "sha256", "git_blob")},
                    "Selected original member differs: " + name)
            selected[name] = data
    for name in ("ledger.js", "transaction-export.js"):
        require(sources["lib/" + name] == selected["compiled/dist/src/" + name],
                "The emitted runtime module must remain byte-identical: " + name)
    require(sources["lib/package.json"] == b'{"type":"module"}\n', "Unexpected ESM loader metadata")
    node_configured = Path(args.node).absolute()
    node = node_configured.resolve(strict=True)
    require(node.is_file() and os.access(node, os.X_OK), "The existing Node runtime is not executable")
    environment = dict(os.environ)
    environment.pop("NODE_OPTIONS", None)
    environment.pop("NODE_PATH", None)
    version_run = subprocess.run([str(node), "--version"], env=environment, capture_output=True, text=True, timeout=5)
    require(version_run.returncode == 0 and version_run.stdout.strip() == "v26.3.0",
            "This received installation requires the existing Node v26.3.0 runtime")
    node_stat = node.stat()
    node_sha = hashlib.sha256()
    with node.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            node_sha.update(chunk)
    template = sources["launcher.sh.in"].decode("utf-8")
    require(template.count("@NODE@") == 1 and template.count("@APP_DIR@") == 1,
            "Unexpected launcher template")
    launcher = template.replace("@NODE@", shlex.quote(str(node))).replace(
        "@APP_DIR@", shlex.quote(str(destination))).encode("utf-8")
    payloads = {
        "household-snapshot-csv": (launcher, 0o700),
        "snapshot-csv.mjs": (sources["snapshot-csv.mjs"], 0o600),
        "README.md": (sources["README.md"], 0o600),
        "INPUTS.json": (sources["INPUTS.json"], 0o600),
        "lib/package.json": (sources["lib/package.json"], 0o600),
        "lib/ledger.js": (sources["lib/ledger.js"], 0o600),
        "lib/transaction-export.js": (sources["lib/transaction-export.js"], 0o600),
        "examples/fictional-ledger.json": (selected["receiver/candidate-run/literal/ledger.json"], 0o444),
        "examples/expected-statement.csv": (selected["receiver/candidate-run/deliveries/001-literal-0.csv"], 0o600),
        "recovery/original-qualified-owner-archive.tar.gz": (archive, 0o600),
    }
    payloads.update({"recovery/source/" + name: (data, 0o600) for name, data in sources.items()})
    before_bytes = owned_size(owned)
    projected = before_bytes + sum(len(data) for data, _ in payloads.values()) + 32768
    require(projected <= CAP, "Combined owned preparation and installation would exceed 4 MiB")
    # No destination exists until all source, archive, runtime and capacity admission passes.
    admitted_capacity = capacity(owned)
    require(not os.path.lexists(destination), "Destination appeared during admission")
    destination.mkdir(mode=0o700)
    os.chmod(destination, 0o700)
    inventory = {}
    for relative, (data, mode) in payloads.items():
        path = destination / relative
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        write_new(path, data, mode)
        info = path.stat()
        inventory[relative] = {**identity(data), "mode": oct(stat.S_IMODE(info.st_mode)), "mtime_ns": info.st_mtime_ns}
    record = {
        "schema": "household-snapshot-csv-installation/v1",
        "installed_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "destination": str(destination),
        "entry": str(destination / "household-snapshot-csv"),
        "source_directory": str(source),
        "owned_preparation_directory": str(owned),
        "source_files": {name: identity(data) for name, data in sources.items()},
        "original_archive": identity(archive),
        "source_artifact_commit": inputs["source_artifact_commit"],
        "exact_native_source_content_tree": inputs["exact_native_source_content_tree"],
        "native_source_parent": inputs["native_source_parent"],
        "node": {"configured": str(node_configured), "resolved": str(node), "version": version_run.stdout.strip(),
                 "bytes": node_stat.st_size, "sha256": node_sha.hexdigest(), "mtime_ns": node_stat.st_mtime_ns},
        "capacity_before_destination_creation": admitted_capacity,
        "owned_preparation_bytes_before_install": before_bytes,
        "combined_owned_cap": CAP,
        "files": inventory,
        "marker_written_last": True,
        "recovery": "Original archive and all eight source inputs retained; use a new separate destination.",
        "product_invocations_during_install": 0,
        "services_or_external_packages": [],
    }
    marker = (json.dumps(record, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    require(len(marker) <= 32768, "Installation marker exceeds its reserved allocation")
    write_new(destination / "INSTALLATION.json", marker, 0o600)
    total = owned_size(owned) + owned_size(destination)
    require(total <= CAP, "Actual combined allocation exceeds 4 MiB")
    return {"installed": str(destination), "entry": record["entry"], "files": len(inventory) + 1,
            "installed_bytes": owned_size(destination), "combined_owned_bytes": total,
            "installation_marker": identity(marker), "node": record["node"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", required=True)
    parser.add_argument("--destination", required=True)
    parser.add_argument("--owned-root", required=True)
    parser.add_argument("--node", default="/opt/homebrew/bin/node")
    args = parser.parse_args()
    os.umask(0o077)
    try:
        print(json.dumps(install(args), ensure_ascii=False))
    except Exception as error:
        print(json.dumps({"error": str(error), "destination": str(Path(args.destination).absolute()),
                          "partial_destination_policy": "Preserve any newly created partial destination for inspection; do not overwrite or delete it automatically."}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
