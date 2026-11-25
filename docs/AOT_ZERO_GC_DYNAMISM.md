# HDL / hardware AOT — controlled dynamism and allocation restrictions

**Target checklist; no full-language synthesis or zero-GC certification.** Historical background: [organization policy PR #38](https://github.com/ores-truffle-oreslang/.github/pull/38) and [specification PR #18](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/pull/18).

## Admission policy

- An HDL synthesis subset is a **static bounded hardware profile**, not proof that the complete AttoLang program can run AOT on an FPGA/ASIC. Reject all unsupported actors, arbitrary heap allocation, runtime `eval`, class/method creation, reflection, unbounded dispatch, interpreter/JIT fallback and dynamic proxy targets before emitted RTL.
- Accept generated proxy/virtual dispatch logic only when a *finite* class/interface registry is validated and a hardware resource/scheduling lowering is actually implemented. Do not project native actor heap or coroutine semantics onto flip-flops/BRAM without evidence.
- Specify static widths, bounds, resource limits, memory lifetime and ownership during synthesis. Source-level moves/borrows and Sendable constraints remain required before hardware lowering; runtime garbage collection is generally not a meaningful hardware-synthesis claim.
- Target canonical semantics: explicit ownership operations, no implicit conversions/operator overloading, no `%`/`^`/`^^` and no nested `Option`/`Future` implicit flattening. Legacy operator acceptance in the current compiler is a migration gap, not a claim that these diagnostics are implemented. Do not broaden the existing scalar subset without parser + typechecker + RTL tests.

## Minimum tests

- **Positive:** canonical `.atto` scalar circuit compiled through real frontend to SystemVerilog, Icarus simulation and Yosys synthesis with exact source SHA and gate counts.
- **Negative:** runtime class creation, `eval`, reflection, open-ended proxy and dynamic heap/actor/coroutine constructs rejected before RTL; width overflow and resource-limit cases.
- **Evidence:** emitted RTL hash, compiler SHA, fixture blob, executed job steps and real simulation/synthesis logs. Existing Node software-reference tests alone do not verify synthesized hardware. `steps=[]`/`steps=null` is **NOT_EXECUTED**.

Keep claims profile-specific: this document does not change the current compiler or certify AOT parity or zero process-GC.
