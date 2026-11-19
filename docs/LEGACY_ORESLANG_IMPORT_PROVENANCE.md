# Legacy Oreslang HDL implementation import — pinned evidence

## Scope and reproducibility

- Source: `ores-truffle-oreslang/oreslang-source.hdl` `main` at `a9fd278965d08b58378ff41237ccd19ab2e766c5`.
- Destination: `atto-lang/atto-source.hdl` based on `2fd5fede496841f87f577450a589f993e7224448`.
- This changeset imports **39 legacy implementation, tests, tools, and bounded CI files**, each copied into the destination Git object database and independently checked for **exact SHA-1 blob identity** against the source tree. Root `README.md` and `AGENTS.md` remain Atto-owned.
- Imported files intentionally preserve established `.ores`, `oreslang-hdl`, and other historical names and compatibility behavior. This is not a claim that the backend supports the entire AttoLang grammar or is production-ready.

## Excluded pending separate review

The legacy source's Python scripts and tests are **not imported**: the Atto policy for new support tooling prefers Rust and forbids adding Python helpers. Repository-specific private CI policy, CODEOWNERS, PR templates, legacy integration metadata, and other workflows also require explicit adaptation rather than a blind replacement. Do not delete or represent those source-side commits as migrated; retain their exact source provenance until their effects are reconciled.

## Honest verification / remaining historical work

- Byte identity: **passed** for 39 imported blobs against the pinned legacy HEAD.
- Node 22 `npm test`, Icarus `iverilog`, Yosys synthesis, and Rust helper checks on the **destination head**: **not executed at commit creation**. The imported workflows request tests; green results must be read from the *exact resulting PR SHA*, not inferred.
- The 39-file transfer **does not preserve the original source commit graph**. A separate ordinary Git `fetch` and history-preserving `merge --allow-unrelated-histories` is required to make original legacy commits ancestors of Atto main. Do not squash/rebase the historic side and do not rewrite Atto main.
- The source repository also had **22 open draft PRs** at audit time; reconcile them by content and tests before claiming complete branch/PR migration.
- Any difference in file count or source SHA requires a fresh comparison; do not silently update the source baseline.
- Do not claim guest execution, synthesis equivalence, full AOT, zero-GC, or hardware execution from a host-only test.

## Review gate

This imported snapshot is a **draft candidate**, not approval to merge. Preserve the organization’s ready-cycle review policy, find overlapping legacy and destination PRs, require actual exact-head material CI, and obtain independently authenticated required approvals. Never bypass branch restrictions or transfer secrets.
