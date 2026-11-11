# Oreslang HDL compiler — experimental source-to-SystemVerilog

This repository now contains a **working standalone experimental source-subset compiler**. It is NOT integrated with the main Java/LLVM Oreslang compiler or common HIR/MIR, and is NOT evidence of FPGA or ASIC execution.

Supported source: one `pub fnc` or `fnc`, one or more `u1..u64` unsigned parameters, matching return type, and a single return expression using input parameters, `+`, `-`, parentheses and the explicitly admitted `Integer.bitXor(lhs,rhs)` call (equal-width unsigned operands). Removed source operators `%`, `^` and `^^` fail closed. AttoLang `&` (borrow) and `|` (logical OR) also fail closed: neither can be treated as an integer bitwise operator without verified typed lowering. `Integer.bitXor` is an experimental width-specialized HDL operation, **not** evidence of full canonical frontend type parity. All operands have equal widths and arithmetic wraps modulo 2^width. Unsupported features, actors and dynamic effects fail closed.

Run `npm test`. Generate RTL: `node bin/oreslang-hdl.mjs tests/fixtures/add8.atto /tmp/add8.sv`. The `.atto` fixture is byte-identical to the legacy `.ores` source pinned by FPGA/ASIC provenance; the pinned old source and generated RTL artifacts are unchanged. The Node tests check 65,536 software-reference inputs; they are **not** Verilog execution. The GitHub Actions workflow separately requires Icarus RTL simulation and Yosys synthesis; only successful executed jobs are evidence.

Bootstrap CLI is positional-only. Full Oreslang command parsing must use flags-2-env. Long-term work: LLVM frontend typed AST/HIR/MIR adapter, CIRCT, fixed clocks/memories and control-flow lowering.

RFC: https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/65
Tracking: https://github.com/ores-truffle-oreslang/oreslang-source.llvm/issues/551


## Current-main proof utilities retained

This source-to-RTL slice is layered on the current HDL main branch and retains
the existing hardware width/banking proof modules, optimization-intent
preflight, integration manifest, and their tests. Those host-side proofs are
complementary evidence; they are not replaced by the standalone source parser.
