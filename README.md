# Oreslang HDL compiler — experimental source-to-SystemVerilog

This repository now contains a **working standalone experimental source-subset compiler**. It is NOT integrated with the main Java/LLVM Oreslang compiler or common HIR/MIR, and is NOT evidence of FPGA or ASIC execution.

Supported source: one `pub fnc` or `fnc`, one or more `u1..u64` unsigned parameters, matching return type, and a single return expression using input parameters, `+`, `-` and parentheses. All operands have equal widths and arithmetic wraps modulo 2^width. Unsupported features, actors and dynamic effects fail closed.

Run `npm test`. Generate RTL: `node bin/oreslang-hdl.mjs tests/fixtures/add8.ores /tmp/add8.sv`. The Node tests check 65,536 software-reference inputs; they are **not** Verilog execution. The GitHub Actions workflow separately requires Icarus RTL simulation and Yosys synthesis; only successful executed jobs are evidence.

Bootstrap CLI is positional-only. Full Oreslang command parsing must use flags-2-env. Long-term work: LLVM frontend typed AST/HIR/MIR adapter, CIRCT, fixed clocks/memories and control-flow lowering.

RFC: https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/65
Tracking: https://github.com/ores-truffle-oreslang/oreslang-source.llvm/issues/551


## Current-main proof utilities retained

This source-to-RTL slice is layered on the current HDL main branch and retains
the existing hardware width/banking proof modules, optimization-intent
preflight, integration manifest, and their tests. Those host-side proofs are
complementary evidence; they are not replaced by the standalone source parser.

## Repository ownership and migration (2026-11-08)

**Present home:** `ores-truffle-oreslang/oreslang-source.hdl` in the legacy Oreslang organization; the public language name is **AttoLang**. Preserve existing `oreslang-*` project, package and command names and `.ores` fixtures until explicitly verified migration steps are approved.

- **Belongs here:** Hardware-description-language code generation research and ABI checks.
- **Does not belong here:** Cloud hosting or unverified production ASIC/FPGA capabilities. Shared language semantics and portable core/std should be implemented as canonical `.atto` code rather than copied into per-host adapters.
- **Organization separation:** [atto-lang](https://github.com/atto-lang) governs language/compiler/runtime/tooling/conformance and portable ecosystem code. [atto-co](https://github.com/atto-co) governs commercial cloud deployments, billing, identity, tenancy and hosted services. A similarly named pre-existing `atto-*` repository is not proof of an executed Git transfer or parity.
- **Proposed migration:** this legacy repository may first transfer to `atto-lang/oreslang-source.hdl` under its **existing name and stable GitHub repository ID**. No direct `atto-co` move is currently authorized; product carve-outs require a later independent plan.

**Transfer gate:** claim coordination in [legacy issue #26](https://github.com/ores-truffle-oreslang/.github/issues/26) and use [review-only transfer runbook #25](https://github.com/ores-truffle-oreslang/.github/pull/25). Record exact head SHA/tree and ID, independent security and source/target admin approval, destination rules/visibility, PRs, Actions, app credentials, packages, releases, webhooks, Pages, dependents and rollback owner. Do **not** mirror private sources or overwrite existing `atto-*` repos. Recheck unchanged ID/tree and controls after real GitHub ownership transfer; execute exact-head CI at destination. `steps=[]` or `steps=null` is `NOT_EXECUTED`; host-only or source-free tests do not prove compiled AttoLang guest features. Do not mix repository transfers with forced syntax renames or AOT/zero-GC claims.
