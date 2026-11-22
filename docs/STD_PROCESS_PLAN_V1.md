# AttoLang std.process — HDL capability boundary

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
