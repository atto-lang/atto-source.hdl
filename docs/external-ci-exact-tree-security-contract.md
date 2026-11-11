# External private GitHub Actions for AttoLang HDL — proposed review contract

**Status:** DRAFT / SECURITY REVIEW REQUIRED. This document does **not** authorize private source transfer while its PR is unmerged or lacks independent approval from @ORESoftware. The source repository's current `main` policy is DENY-ALL.

## Why this is proposed

GitHub-hosted Actions in `ores-truffle-oreslang/oreslang-source.hdl` are failing before runner admission: `steps=null`. A separate **source-free** control has actually executed successfully: `gha-indie-worker/gha-indie-worker-docs` workflow run [42964513228](https://github.com/gha-indie-worker/gha-indie-worker-docs/actions/runs/42964513228), four executed steps, job success. This proves only the availability of the destination runner, **not** the ability to execute source HDL, simulate RTL or validate ASIC/FPGA claims.

## Explicit review authorization boundary

- Proposed destination: `gha-indie-worker/gha-indie-worker-docs`, numeric GitHub repository ID **`1351003564`**, **private**. Current source repo is also private.
- Owners must verify the destination repository's ID, private visibility, billing, permissions, administrators, retention settings, branch restrictions, allowed Actions and artifact access immediately before any transfer. The destination's name alone is not sufficient.
- `/.github/private-ci-approved-repositories.txt` on the **merged, trusted source default branch** must list this exact name and ID, and the policy/workflow edit must have an **independent APPROVED review** by @ORESoftware. An approved comment on an unmerged draft is insufficient.
- Before approval/merge, transfer of even one compiler source file, RTL fixture, generated artifact or Git blob from this private source repository to that destination remains **prohibited**, including writing content into issue comments, logs or artifact archives.
- Authorization covers this source repository and this destination only; it grants no blanket approval to export unrelated private repositories or secrets. If source policy is revoked, halt further transfers.

## Transfer design (only after authorization)

1. Pin a specific immutable HDL PR head **commit SHA**, its **root tree SHA**, and byte SHA-256 hashes of canonical `.atto` input, legacy `.ores` input and pinned expected RTL from source Git. Do not copy from a moving branch ref after pinning.
2. Review the tree manifest first: enumerate `git/trees/<commit>?recursive=1`, reject `truncated=true`, submodules (`160000`), symbolic links (`120000`), LFS pointers and unexpectedly large/unrecognized files, and require full blob count and byte accounting. No credentials, environment files or hidden private files may be added to the mirror.
3. In the authorized destination, create a **new, clearly marked, nonproduction private review branch**; use the destination API to create *only* Git blobs and a subtree named `mirrors/atto-hdl/<pinned-head>/`. Do not transfer source workflow YAML into the **top-level** destination `.github/workflows/`. Do not use cross-org checkout tokens or personal access tokens in destination Actions.
4. Verify each destination blob's Git SHA matches the source blob SHA and verify the entire mirrored subtree Git tree SHA equals the pinned source root Git tree SHA. Independently check the expected total file count, original executable/file modes and immutable source commit/tree.
5. Run only a **reviewed, destination-owned, pinned workflow** with `permissions: contents: read`, `persist-credentials: false`, no secrets, no `pull_request_target`, no untrusted dynamic command construction, and no execution of source-controlled workflow files. Checkout the destination branch using its own `GITHUB_TOKEN`; verify `HEAD:mirrors/atto-hdl/<pinned-head>` equals source tree **before** any test steps.
6. Execute actual Node 22 tests, Icarus `iverilog/vvp` RTL reference/differential matrices, Yosys synthesis and Yosys SAT equivalence. Require 15/15 full-width proof passes and one genuine negative-mutant counterexample, with exact log sentinels and enforced nonzero executed job steps. A successful V8 host reference check or synthetic model cannot replace these steps.
7. Bind proof receipts to source commit/tree, destination HEAD/tree, mirror subtree tree, workflow run ID, attempt number, job ID, workflow version, tool versions, and all log and RTL SHA-256 hashes. Exclude secrets and source text from stdout and preserve reviewed artifacts only within authorized private retention limits.
8. Any conflict, mismatch, missing witness or changed original PR head yields **NOT_EXECUTED/FAILED**, not an equivalence pass. Never overwrite the original source PR status or impersonate source-org GitHub Checks.
9. Independently review the artifacts before declaring the draft HDL PR ready, and delete the temporary mirror/branch after evidence retention requirements are met; verify access revocation and repository policy has not changed.

## Separate verification classes

- A source-free destination runner canary is **RUNNER_ADMISSION_ONLY**.
- Real exact-subtree private CI is **EXECUTED_RTL_SIMULATION_AND_GENERIC_SYNTHESIS** once all required checks execute; SAT adds **FORMAL_RTL_EQUIVALENCE** for supported finite bitvectors.
- Neither proves integration with canonical typed AttoLang HIR/MIR, FPGA board I/O/timing/electrical constraints or ASIC PDK/DRC/LVS/STA signoff. Those remain independent release gates.

## Current release hold

Do not mirror, run guest compiler-backed tests in the destination or merge the source-policy PR before independent security approval and source default-branch merge. Do not merge HDL PR #33, FPGA PR #27 or ASIC PR #28 solely on this canary.
