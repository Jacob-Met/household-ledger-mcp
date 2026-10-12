#!/usr/bin/env python3
"""Package an already built, source-pinned Household Ledger local MCP service.

The archive includes the existing source, compiler output, locked runtime
dependencies and their original license files. It requires an installed Node
runtime; it performs no installation, starts no service and reads no ledger.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import tarfile


SUPPLEMENTS = [
    "tools/package-local-mcp.py",
    "tools/receive-packaged-stdio.py",
    "tools/stdio-package-expected.json",
    "docs/PACKAGED_MCP.md",
]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="unused .tar.gz filename in an existing directory")
    args = parser.parse_args()
    root = args.source.resolve()
    # Preserve the caller's filename so exclusive creation also refuses a
    # dangling symlink at that destination.
    output = args.output.absolute()
    manifest_bytes = args.source_manifest.read_bytes()
    source = json.loads(manifest_bytes)
    files = {}
    verified_source = {}

    def add(relative):
        path = PurePosixPath(relative)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("package path is not relative: " + relative)
        local = root / relative
        if local.is_symlink() or not local.is_file() or not local.resolve().is_relative_to(root):
            raise ValueError("package input must be a contained regular file: " + relative)
        files[relative] = local

    for entry in source["files"]:
        add(entry["path"])
        data = files[entry["path"]].read_bytes()
        blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
        if len(data) != entry["bytes"] or sha256(data) != entry["sha256"] or blob != entry["sha"]:
            raise ValueError("source manifest mismatch: " + entry["path"])
        verified_source[entry["path"]] = data
        if entry["path"].endswith(".ts") and entry["path"].split("/")[0] in {"src", "test"}:
            stem = "dist/" + entry["path"][:-3]
            for suffix in [".js", ".d.ts", ".js.map"]:
                add(stem + suffix)

    lock = json.loads(verified_source["package-lock.json"])
    packages = []
    for relative, locked in sorted(lock["packages"].items()):
        if not relative or locked.get("dev"):
            continue
        if not relative.startswith("node_modules/"):
            raise ValueError("unsupported dependency location: " + relative)
        location = root / relative
        installed = json.loads((location / "package.json").read_text(encoding="utf-8"))
        if installed["version"] != locked["version"]:
            raise ValueError("installed dependency differs from lock: " + relative)
        packages.append({"path": relative, "name": installed["name"], "version": installed["version"],
                         "integrity": locked.get("integrity")})
        # Nested dependencies have their own lock entries. Preserve every other
        # regular package file, including licenses, while excluding npm bin links.
        for directory, directories, names in os.walk(location, followlinks=False):
            directories[:] = sorted(d for d in directories if d not in {"node_modules", ".bin"})
            for child in directories:
                if (Path(directory) / child).is_symlink():
                    raise ValueError("dependency contains a directory symlink: " + str(Path(directory) / child))
            for name in sorted(names):
                add((Path(directory) / name).relative_to(root).as_posix())

    for relative in SUPPLEMENTS:
        add(relative)
    memory = {"SOURCE-MANIFEST.json": manifest_bytes,
              "START_HERE.md": (root / "docs/PACKAGED_MCP.md").read_bytes()}
    entries = []
    for relative, path in sorted(files.items()):
        data = path.read_bytes()
        if relative in verified_source and data != verified_source[relative]:
            raise ValueError("source changed after manifest verification: " + relative)
        entries.append({"path": relative, "bytes": len(data), "sha256": sha256(data)})
    for relative, data in sorted(memory.items()):
        entries.append({"path": relative, "bytes": len(data), "sha256": sha256(data)})
    receipt = {
        "format": "household-ledger-local-package/1",
        "source_commit": source["source_commit"], "source_tree": source["source_tree"],
        "source_manifest_sha256": sha256(manifest_bytes),
        "entrypoint": "dist/src/stdio.js", "node_requirement": ">=20",
        "scope": "Local process-spawned development; one process per explicit ledger file.",
        "runtime_packages": packages, "files": sorted(entries, key=lambda item: item["path"]),
    }
    memory["PACKAGE-MANIFEST.json"] = (json.dumps(receipt, indent=2) + "\n").encode("utf-8")
    # Read and fingerprint the complete payload before creating an output. The
    # receiver verifies these same bytes after extraction and before execution.
    with output.open("xb") as handle:
        try:
            with gzip.GzipFile(filename="", mode="wb", fileobj=handle, mtime=0) as compressed:
                with tarfile.open(fileobj=compressed, mode="w", format=tarfile.PAX_FORMAT) as archive:
                    expected = {item["path"]: item for item in entries}
                    for relative in sorted([*files, *memory]):
                        data = memory[relative] if relative in memory else files[relative].read_bytes()
                        if relative in expected and sha256(data) != expected[relative]["sha256"]:
                            raise ValueError("package input changed while archiving: " + relative)
                        info = tarfile.TarInfo("household-ledger-mcp/" + relative)
                        info.size, info.mode, info.mtime = len(data), 0o644, 0
                        archive.addfile(info, io.BytesIO(data))
        except Exception:
            output.unlink()
            raise
    print(json.dumps({"archive": str(output), "archive_bytes": output.stat().st_size,
                      "archive_sha256": sha256(output.read_bytes()),
                      "source_commit": source["source_commit"],
                      "files": len(files) + len(memory), "runtime_packages": len(packages)}, indent=2))


if __name__ == "__main__":
    main()
