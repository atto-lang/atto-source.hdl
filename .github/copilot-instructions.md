# AttoLang HDL contributor directives

Follow [AGENTS.md](../AGENTS.md) and [HDL AOT/static allocation checklist](../docs/AOT_ZERO_GC_DYNAMISM.md). Reject unsupported dynamic class/proxy/reflection/eval/heap features before RTL, retain strict bounded hardware profile, distinguish JavaScript host tests from Icarus/Yosys execution, and avoid claiming full guest AOT or zero-GC for unsupported actor/coroutine semantics. Preserve no-Python/Rust tooling and source-first policies.
