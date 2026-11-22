# AttoLang std.process — HDL capability boundary


## Public API naming: asynchronous by default

In AttoLang, non-parking asynchronous operations are the **default** and
their names have no `_async` suffix: `spawn`, `collect_output`, `wait`,
`terminate`, and `kill`. The call sites may use `await child.wait()`
and `await child.collect_output()`. An intentionally synchronous/blocking
variant, if ever exposed, **must** end in `_blocking`. This is a public
semantic contract, not evidence that this backend implements OS process
launch or guest execution. Browser WebAssembly and synthesizable HDL remain
unsupported unless a separately authorized host provider exists.


## Public library path contract (2026-11-22)

Atto's preferred public import is `std/process`; `atto.std/process`
is the explicit, disambiguating built-in import. Apply the same rule to
`std/process_policy` and `atto.std/process_policy`. Do **not** publish
`ores.std/process` or `ores.std/process_policy` as new import names.
The two accepted spellings must resolve to the same compiler-owned module
identity and source, not two copies or an unchecked filesystem path.
The `atto.std/*` root must be reserved against local-package shadowing.

This backend's current relative fixture imports and source-only policy
**do not establish that either hosted import alias is implemented** in its
compiler. Resolver registration, positive/negative guest tests and an
exact-head execution receipt remain required before calling namespace
parity implemented.


This target owns a pure `stdlib/process_policy.atto` policy source and
`tests/fixtures/std-process-policy-v1/main.atto` for source-level parity.

**The HDL/hardware target does not support child OS processes.**
`process.spawn`, `process.fork`, `process.shell`, `wait()`, pipe I/O and
process signals must fail with a compile-time unsupported-capability
diagnostic; they must never lower into synthesized circuits or silently
become testbench/task/actor constructs. The pure ProcessPolicy admission
predicates do not imply host capabilities.

A future **host-side FPGA/ASIC testbench agent** can execute OS child
processes only outside the synthesizable guest and behind a separately
authenticated broker. That functionality must not be confused with
native HDL guest execution or a hardware capability.

The expected-exit-42 Atto fixture documents the pure source policy,
but the present HDL compiler's supported subset cannot be assumed to
compile its module/import/function forms. Source, HDL compilation,
negative unsupported diagnostics and guest execution are currently
**NOT EXECUTED / NOT VERIFIED**. No claim of process-spawn parity.
