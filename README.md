> **AI agent instructions (organization-wide):** Before working on code, issues, or pull requests, read and follow the [organization `AGENTS.md`](https://github.com/atto-lang/.github/blob/main/AGENTS.md), including its **merge-first stealth-development policy**. Honor any repository-local `AGENTS.md`, explicit holds, and GitHub-enforced rules.

# atto-source.hdl

Experimental hardware-description compilation backend for AttoLang.

## Naming and specification migration

This is the canonical [AttoLang backend repository](https://github.com/atto-lang/atto-source.hdl). Use `.atto` for portable AttoLang source and update local remotes to `https://github.com/atto-lang/atto-source.hdl.git`; do not use historical repository links or naming in new examples.

- **Normative grammar and semantics:** [atto-spec](https://github.com/atto-lang/atto-spec). Check the current versioned contracts for ownership operations (`borrow!`, `take!`, `share!`, `copy!`, `copy!!`), implicit argument borrowing, `lt!` binders, `eq`/`neq` value equality, `susp` effects and file/module `define const`. These are *specification targets*, not claims of executable support in this backend.
- **Positive and negative guest execution evidence:** [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance) and [atto-compilers-parity-testing](https://github.com/atto-lang/atto-compilers-parity-testing). Report `passed`, `failed`, `unsupported` or `not executed`, and pin exact compiler, source tree, target and toolchain.
- **Portable shared sources and target constraints:** [atto-common-source](https://github.com/atto-lang/atto-common-source) and [atto-target-profiles](https://github.com/atto-lang/atto-target-profiles). Keep backend-specific gaps explicit, and do not infer guest parity from host tests or zero-step CI runs.

## Scope

This repository is the AttoLang ecosystem home for:

- Hardware-target exploration, synthesizable subset definition, and capability-gated compilation.
- Compatibility with the [canonical language specification](https://github.com/atto-lang/atto-spec) where applicable.
- Evidence-based tests, benchmark results, and cross-backend conformance reporting.

## Architecture and compatibility

AttoLang is designed around actors, explicit ownership, and portable concurrency semantics. Backend-specific optimizations must not silently change the shared language contract. Runtime capabilities, target restrictions, and unsupported features should be documented explicitly.

**Canonical runtime terminology:** [TenantVM](docs/TENANT_VM_NAMING_V1.md) is the per-tenant execution boundary in AttoLang generally. This HDL compiler does not implement TenantVM or actor execution; unsupported runtime constructs must continue to fail closed.

The experimental scalar frontend bounds the constructed expression AST to 64 levels, including long left-associated chains with shallow parenthesis depth. Over-depth source is refused before recursive rendering, reference evaluation or SystemVerilog emission.

The scalar subset admits unsigned `u1..u64` with equal-width operands, modular addition/subtraction, grouping and bitwise `&`, `|`, `^^`. Statement-leading `^` aliases `return`; a single infix caret is rejected. The explicitly admitted `Integer.bitXor(a,b)` spelling remains a restricted hardware-profile compatibility alias, not a claim of portable signed-int or general library support. Modulo, unary complement, shifts, Boolean effects and dynamic constructs remain unsupported. See [hardware lowering admission](docs/hardware-lowering-admission-v1.md).

## Building and testing

Run `npm test` for host tests; generate RTL with `node bin/oreslang-hdl.mjs tests/fixtures/add8.atto /tmp/add8.sv`. The canonical fixture preserves the historical source bytes. With Icarus and Yosys installed, `node tests/rtl-matrix.mjs` and `node tests/rtl-formal-equivalence.mjs` execute 30 designs / 2,070 vectors and 30 complete-width SAT proofs plus a deliberately corrupted XOR counterexample. Consult the checked-in CI workflows for exact-head evidence. Add target-specific build instructions and exact-head execution results as they become available; do not treat a passing host-unit test as proof of guest-language conformance.

## Project status

This README describes the repository's intended responsibilities. Feature support and release readiness must be established from implementation, tests, and CI evidence rather than this description alone.

## Related repositories

- [AttoLang organization](https://github.com/atto-lang)
- [Language specification](https://github.com/atto-lang/atto-spec)
- [Platform conformance](https://github.com/atto-lang/atto-platform-conformance)
- [Commercial infrastructure](https://github.com/atto-co)

## Repository ownership and contribution routing

**Belongs here:** HDL-target language subset, high-level-to-RTL lowering, hardware ABI, synthesis constraints and negative compile fixtures.

**Belongs elsewhere:** FPGA board deployment belongs in atto-platform.fpga; ASIC implementation constraints in atto-platform.asic; portable language rules in atto-spec.

**Security and portability boundary:** Do not silently reinterpret dynamic/actor semantics as synthesizable; reject unsupported allocations, host I/O and unschedulable concurrency.

AttoLang is the canonical project identity. Use `.atto` source and `atto-*` naming for all new documentation and portable library code. This README defines scope, not feature readiness.

**Acceptance:** name exact source SHA/tree, runtime/toolchain, positive and negative checks and execution receipt before claiming support. Host-only tests and empty CI steps do not prove guest execution.

### Legacy migration and transfer receipts

The historical repository `ores-truffle-oreslang/oreslang-source.hdl` is archived; this canonical repository is a separate AttoLang home. The presence of a similarly named repository, imported source snapshot or migrated PR is not proof of a GitHub ownership transfer, preserved repository ID or executable parity. Retain legacy `.ores` fixtures and command/package spellings only where compatibility requires them until tested replacements are available.

The language/compiler/runtime/tooling and portable ecosystem are governed by [atto-lang](https://github.com/atto-lang); commercial cloud deployments, billing, identity and hosted services belong to [atto-co](https://github.com/atto-co). No repository transfer or commercial carve-out is authorized by this document.

For any future transfer, record exact source commit/tree, stable repository ID, destination rules and visibility, independently approved security and source/target administrative authority, outstanding PRs, Actions, app credentials, packages, releases, webhooks, Pages, dependents and rollback ownership. Do not overwrite an existing repository or mirror private source without explicit authorization. Verify repository identity, tree, controls and executed CI after an actual transfer; an empty or absent job-step list is **NOT_EXECUTED**. Keep transfers independent of syntax renames or full-language AOT/zero-GC claims.
