# AttoLang HDL compiler — experimental source-to-SystemVerilog (legacy checkout)

## AttoLang migration and authoritative specification (2026-11-18)

**AttoLang** (formerly Oreslang) is the current public language name. The AttoLang-named counterpart is [atto-lang/atto-source.hdl](https://github.com/atto-lang/atto-source.hdl); use that repository for new backend work. The source and artifact history of this `ores-truffle-oreslang/oreslang-source.hdl` checkout may not be synchronized with its counterpart. The compiler is an experimental RTL subset, not proof of FPGA/ASIC deployment, synthesis parity or a general AttoLang compiler.

**Canonical language rules:** [atto-spec](https://github.com/atto-lang/atto-spec) governs syntax, effects, actors, ownership, diagnostics and target semantics; old README prose and earlier Oreslang-named spec drafts are historical. [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance) hosts portable positive/negative guest fixtures, and [atto-compilers-parity-testing](https://github.com/atto-lang/atto-compilers-parity-testing) hosts differential parity work. [atto-common-source](https://github.com/atto-lang/atto-common-source) is for portable `.atto` libraries.

**Current source directives (not automatic backend support):** prefer `.atto` for new portable programs and `snake_case` callable names; explicit ownership uses `borrow!`, `take!`, `share!`, `copy!`, and `copy!!`. [Implicit argument borrowing](https://github.com/atto-lang/atto-spec/blob/main/language/implicit-argument-borrow-v1.md), [file/module constants including one-time non-throwing `os.read_env`](https://github.com/atto-lang/atto-spec/blob/main/language/file-module-const-v1.md), [separate bitwise shifts `<<<`/`>>>`/`ashr` and typed `<<`/`>>` streams](https://github.com/atto-lang/atto-spec/blob/main/language/bitwise-and-stream-operators-v1.md), and [frozen shared ownership](https://github.com/atto-lang/atto-spec/blob/main/language/shared-ownership-and-guards-v1.md) are specified design targets; each backend must independently pass executable admission before claiming support. Preserve existing `.ores`, `oreslang-*` commands, IDs, and ABI/wire spellings until compatibility changes are separately verified.

Do not add Python scripts/tests/CI helpers; Rust is preferred for supporting tooling where practical. A readme rename, an empty `steps=[]` workflow, or a host-only test is not proof of guest-language support, strict AOT, zero GC, OS isolation or cross-backend parity. Document exact compiler/runtime commits, toolchains, actual guest runs and negative rejections with `passed`, `failed`, `unsupported`, or `not executed` results.

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

## Legacy checkout and contribution routing (2026-11-18)

Use [atto-source.hdl](https://github.com/atto-lang/atto-source.hdl) for new AttoLang work and [atto-spec](https://github.com/atto-lang/atto-spec) for normative changes; preserve this checkout as a historical implementation reference. The existence of a similarly named AttoLang repository does not by itself prove complete Git transfer, issue/PR migration or feature parity. Compare exact Git trees, audit outstanding changes and preserve security controls and execution receipts before declaring migration complete. The older [migration tracker](https://github.com/ores-truffle-oreslang/.github/issues/26) and [review runbook](https://github.com/ores-truffle-oreslang/.github/pull/25) document history, not completion.

