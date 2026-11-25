# AttoLang hardware lowering — fail-closed admission contract (draft v1)

**Maturity:** experimental standalone source subset plus *proposed* canonical typed-HIR/MIR integration. This document is not a claim of native frontend integration or physical FPGA/ASIC operation.

## Source and semantics boundary

- The canonical source file extension for new tests is `.atto`; `.ores` remains compatible with pinned historical fixtures.
- Today's independent parser accepts one pure function, one or more `u1..u64` fixed-width unsigned parameters, a matching return width, and one expression containing only `+`, `-`, grouping, equal-width bitwise `&`, `|`, `^^`, and the explicitly admitted hardware-profile compatibility alias `Integer.bitXor(a,b)`. Statement-leading `^` and `return` generate identical RTL.
- Arithmetic wraps modulo `2^width` in this **experimental HDL profile**. Do not silently equate these unsigned width-specific semantics with AttoLang's general signed/checked `int` arithmetic.
- Follow the current [operator contract](https://github.com/atto-lang/atto-spec/blob/main/language/bitwise-and-stream-operators-v1.md): single infix `^` is invalid; contiguous `^^` is XOR. The experimental unsigned hardware profile retains `&` and `|` and extends the operator spellings to equal-width bitvectors; this does not certify portable signed `int`, Boolean logic or stream semantics. Reject unsupported `%`, complement and shifts, and unknown `Integer.*` names. No automatic software fallback is allowed.
- No source-controlled Verilog tokens, dynamic elaboration scripts, user-provided Yosys commands, inferred clocks, implicit state or RTL identifiers outside admitted grammar.
- User-constructible or mutated ASTs do not bypass frontend admission; emission requires the immutable parser-admitted AST.

## Trusted-front-end replacement (required before 'AttoLang compiler-backed hardware' claims)

1. Parse canonical `.atto` using the main AttoLang lexer/parser, not a second grammar. Normalize imports/types/macros with the same source SHA, ownership checks and deterministic elaboration limits as other backends.
2. Lower *typed, immutable, provenance-bound* HIR/MIR into a hardware-admission IR with explicit bit widths, signedness, modulo/checked arithmetic policy, constant propagation, clock/reset and effects. Reject type mismatches before emitting any RTL.
3. Admit a **proven pure combinational** slice first. Reject actors, supervisors, async tasks, channels, allocation/arenas, suspension, exceptions/traps, recursion, indirect calls, reflection, FFI, borrowed references, dynamic arrays, unbounded loops and any unsupported effect. Unsupported semantics cannot be silently implemented on host CPU.
4. Later add opt-in bounded sequential/streaming hardware, with explicit clocks, reset polarity, ready/valid, maximum pipeline depth, maximum resource budgets and crossing-domain analysis. This is future work, not current functionality.
5. Only then consider CIRCT-compatible MLIR/HW/Comb/FSM lowering or an equivalent reviewed typed hardware IR; track the exact compiler and lowering versions. The standalone parser must be retired rather than becoming a second source of language semantics.

## Stage-separated evidence

- **SOURCE_ONLY:** no compiler/RTL evidence.
- **REFERENCE:** host JS bitvector oracle only; no HDL hardware semantics.
- **RTL_SIMULATION:** exact compiler-generated RTL executed in Icarus using reference vectors. Does not prove all inputs.
- **RTL_FORMAL:** independently authored combinational reference circuits compared against emitted RTL using Yosys `miter -equiv -make_assert` and `sat -verify -prove-asserts`, with a required deliberate RTL mutation that produces a counterexample. This is a bounded combinational proof, not source-front-end parity or board qualification.
- **GENERIC_SYNTHESIS:** Yosys mapped/optimized generic netlist. Does not prove placement, timing or real device behavior.
- **FPGA_VIRTUAL:** named FPGA device/package with place-and-route and a virtual bitstream, constrained with reviewed physical pin assignments before any board-ready statement.
- **FPGA_BOARD_VERIFIED:** physical board/programmer, timing closure, pin electrical limits, reset/clock measurements and independent real I/O results.
- **ASIC_PRE_PDK:** generic netlist, without manufacturing qualification.
- **ASIC_SIGNOFF:** legally authorized PDK/corner, Liberty/LEF/SDC, physical timing/power, DRC/LVS/antenna/DFM, GDS and foundry approval; manifest shape never grants signoff.

A successful reference oracle, standalone V8 model, zero-step GitHub Actions job or unreviewed receipt MUST NOT be promoted to compiler execution or physical hardware evidence. A valid receipt must bind exact PR head SHA/tree, executed job attempt and steps, RTL byte hash, tools/version, actual gate logs, and the appropriate physical artifact. The downstream FPGA/ASIC repositories independently pin the historical golden RTL hashes; do not modify these hashes merely to make a test pass.

## Current CI gates

```sh
npm test
node tests/rtl-matrix.mjs
node tests/rtl-formal-equivalence.mjs
```

The matrix exercises 30 designs and 2,070 vectors; the SAT suite proves 30 designs and requires a negative mutant. The last two require real `iverilog`/`vvp`/`yosys` tools; missing tools must be a failure. The CI receipt is written **after** simulation, synthesis, formal equivalence and the mutation control succeed. On the private GitHub organization, jobs with no executed steps remain `NOT_EXECUTED`, not green.

## Release hold

Require independent review and exact-head executed CI before merge. No private-source export to a different organization or untrusted runner is authorized by this contract. Physical FPGA/ASIC releases require separate device/PDK authorization and safety evidence.
