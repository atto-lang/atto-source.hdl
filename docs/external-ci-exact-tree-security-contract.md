# External private GitHub Actions for AttoLang HDL — independently reviewed carrier grant

**Status: DRAFT / NOT AUTHORIZED FOR PRIVATE SOURCE EXPORT.**
This document belongs to [atto-source.hdl#29](https://github.com/atto-lang/atto-source.hdl/pull/29).
The current source **protected main** allowlist denies all private CI exports.
Do not use an unmerged PR branch as permission to export private source.

## Newly verified private runner and Git-object transport

Proposed recipient: **`ores-rate-limit-test/atto-ci`**, immutable GitHub repository
ID **`1460083010`**, presently private and writable through the owner's
GitHub connector. This proposed replacement supersedes the historical
`gha-indie-worker/gha-indie-worker-docs` candidate in this PR; it does
not transfer or authorize any source.

Three independently executed current private-carrier proofs from 2026-11-21:

1. [sonus-auris-test/atto-ci#44954059125](https://github.com/sonus-auris-test/atto-ci/actions/runs/44954059125):
   no-source Linux capacity probe, seven actual successful job steps,
   4/4 Node SHA/mode/collision tests.
2. [ores-rate-limit-test/atto-ci#44954299083](https://github.com/ores-rate-limit-test/atto-ci/actions/runs/44954299083):
   exact **four-file synthetic root-tree** transplant from
   `sonus-auris-test/atto-ci` using only authenticated GitHub
   connector blob/tree/commit operations, six successful job steps,
   4/4 Node tests, no cross-org checkout/PAT/secrets.
3. [ores-rate-limit-test/atto-ci#44954478181](https://github.com/ores-rate-limit-test/atto-ci/actions/runs/44954478181):
   **destination-owned** workflow verifies a **non-executable mirrored
   subtree**, every one of the four blob SHA identities, modes, file
   count and subtree SHA. Six successful steps, 4/4 Node tests.

The source and destination synthetic Git trees were independently verified
at SHA `d98fcd0434345fc957d5b93f5797a06590e8f8b6`.
The destination subtree is
`mirrors/atto-hdl/5aba488d684280b0a6034556bc8be950687aab9e/`.
The mirrored `.github/workflows/` files stayed *nested data*;
the executable check was separately authored inside the destination
root `.github/workflows/`.

**These four files were purpose-written synthetic test material only.**
They contain **zero private Atto compiler code/RTL/fixtures**, and the
successful run is **CARRIER_ADMISSION_AND_SHA_TRANSPORT_ONLY**.
It is not `atto-source.hdl` compiler parity or board/ASIC signoff.

## Exact security and authorization prerequisites

The following must ALL be satisfied **before** transferring even one
private Atto source blob, including source-controlled workflows/RTL fixtures:

1. The change to `.github/private-ci-approved-repositories.txt` and its
   policy parser/CI must be independently **APPROVED** by
   `ORESoftware` (GitHub ID `11139560`), who is not PR author, and
   **merged into the trusted source repository's protected main**.
   Verify effective CODEOWNERS/required checks and that the review remains
   effective. The current draft, comments, synthetic CI and user-specified
   fallback mechanism do not by themselves remove this repo's export hold.
2. Re-fetch the **protected main** allowlist after the merge, validate the
   exact `ores-rate-limit-test/atto-ci 1460083010` tuple and no other
   entries; abort on mismatch, unverifiable authorization or label/security hold.
3. Independently verify the target's immutable repository ID, private
   visibility, collaborators, Actions capacity, retention, artifacts and
   admin privileges **again** immediately before export. Never rely solely
   on the slug or success of an old carrier run.
4. Pin source **HEAD SHA and complete root Git-tree SHA** of the exact
   HDL candidate. Enumerate every tree entry recursively and reject
   `truncated=true`, gitlinks/submodules, symlinks, LFS pointers,
   over-budget blobs, secret-containing paths, missing modes or unknown
   encodings. Record every expected path, mode, type, blob SHA and size.
5. Recreate **every** blob in the private approved destination with the
   GitHub connector, with no cross-org GITHUB_TOKEN checkout, personal
   token, SSH key or secret transfer. Check each returned destination
   blob SHA exactly. Build a complete source tree, demand its root
   SHA equal the pinned source root, then attach that tree only under
   `mirrors/atto-hdl/<source-head>/` in a new temporary destination
   branch using a CAS/expected-HEAD update.
6. The running workflow must be **destination-owned, protected and pinned**.
   Never promote transferred source `.github/workflows` into
   executable destination root workflows; never run
   `pull_request_target` against mutable private source. Checkout
   the destination branch with destination-local `GITHUB_TOKEN` and
   `persist-credentials:false`, and re-check exact source subtree
   Git tree SHA, each critical blob and immutable source commit identity
   before compiling anything.
7. Run **real** Node 22 HDL compiler frontend tests, genuine generated RTL
   simulation with Icarus `iverilog/vvp`, Yosys synthesis and SAT
   equivalence plus a negative mutated-circuit counterexample. Require
   the target's full 15/15 required bitwidth checks, strict diagnostics,
   no RTL artifact on rejected source, and actual stepful Actions job
   receipts. Missing compiler artifact, failed SAT, empty log or skipped
   job is NOT a pass. A source-free carrier canary does not qualify.
8. Evidence must include source HEAD/tree, destination HEAD/tree and
   subtree SHA, every compared blob, workflow+job+attempt IDs,
   toolchain versions, log/RTL SHA-256, executed steps and time.
   No source text/secrets printed in logs. Store only reviewed private
   artifacts for bounded retention; remove temporary mirror/branch
   after evidence collection and verify access revocation.
9. Any inconsistency or approval revocation aborts further transfers.
   Alternate-org CI is **supplemental**: it cannot satisfy source-org
   required checks, reviewer rules or merge restrictions by itself.
   Never push or alter the original source PR during mirroring.

## Verification classes

- Source-free runner canary: `RUNNER_ADMISSION_ONLY`.
- SHA-exact synthetic tree/subtree demo: `MIRROR_TRANSPORT_ONLY`.
- Authorized, executable HDL candidate test: `SOURCE_EXACT_HEAD_RTL_GUEST_CI`
  **only** after actual source compiler/RTL/Yosys tests genuinely run.
- FPGA board or ASIC release signoff: **out of scope**.

The existing [bang-keyword compiler draft #21](https://github.com/atto-lang/atto-source.hdl/pull/21)
and the other `atto-source.*` compiler PRs remain Draft until their
own source/guest conformance criteria pass. No private-source mirror
is claimed by this draft security proposal.
