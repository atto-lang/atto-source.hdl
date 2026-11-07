# AttoLang HDL compiler agent directives

Preserve the repo's experimental source-to-SystemVerilog scope and fail-closed unsupported constructs. Keep guest source fixtures canonical `.atto` when the compiler admits them; legacy `.ores` is migration-only. Preserve no Python / Rust-only first-party tooling, security and independent review.

## Controlled dynamism, AOT and memory

Apply [organization policy PR #38](https://github.com/ores-truffle-oreslang/.github/pull/38), [AttoLang language-spec PR #18](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/pull/18) and [backend review checklist](docs/AOT_ZERO_GC_DYNAMISM.md) where the hardware profile is applicable. No runtime eval, class/method injection, unbounded reflection, unknown proxy targets, interpreter fallback or dynamic code emission in synthesis-directed AOT. Compile-time macros, finite static dispatch and ownership-safe state machines require supported hardware lowering; otherwise reject explicitly.

Explicitly label unsupported actor heaps, closures, task frames and dynamic allocation. Synthesis-time memory allocation is not a runtime guest zero-GC guarantee. Maintain no implicit conversions, operator overloading, `%`/`^`/`^^` reintroduction or automatic nested `Future`/`Option` flattening. Do not claim HDL/SV simulation as five-backend native guest execution. Require exact-head real Icarus/Yosys synthesis/test evidence and negative tests. Zero-step jobs are **NOT_EXECUTED**.
