# Dependency provenance clarification

This note is additive. It does not replace the original issue #13 or issue #15 source, reports, manifests or archives.

The original dependency-source-pins.json (SHA256 fc989762b3363bf781a61c689f5c97dbeebaea59a56b8f2311c5cc926a957d71) recorded 2,960 selected regular files from the existing donor at /tmp/c36a60df2cc1-household-compare/worktree/node_modules. Earlier wording describing those as all installed dependency files was too broad. The selected files were actually checked; the selection was not a full filesystem inventory.

A later attempt to copy that selected set into an isolated installed-command build exposed the omission: typescript/bin/tsc was absent. The first compiler could not launch; a subsequent compiler route exposed missing Response declarations. Both negatives are preserved in the separate installed-entry continuation. The copy was completed without changing product source.

The full donor inventory has 3,898 regular files and three relative bin links. The additional 938 regular files total 3,486,806 bytes. Root independently captured the complete actual set at 2026-10-09T00:39:08.083833+00:00; full-dependency-source-pins.json is its exact 673,751-byte manifest, SHA256 5274e4b46eca7c11a4c894d7963f888852159c9276ec4a5c9a6ef4a02f7acd47. It confirms all earlier 2,960 selected hashes. The full later capture does not retroactively pin omitted files at historical execution times.

For issue #15, the final independent native build was bracketed by the complete donor inventory and reproduced all 109 final source/compiled artifacts; receipt SHA256 f0ab2e79d363be833898ad8d8ed717b22780143be973bffcf58a1c9bfa58b13e. Its final source/process/tree audit separately verified the complete actual file/link set. Existing runtime cases were not repeated because of this provenance correction.

For issue #13, the original accepted runtime and build results retain their original selected-file provenance. No retrospective full-dependency or new runtime assertion is made for that historical version. Its later installed-command extension is separately pinned and received against the completed copy; it is not relabeled as the original five-path version.

The unchanged lock and installed package versions remain recorded. No dependency download, shared package mutation, new version, workflow relaxation or invented historical hash accompanies this clarification.
