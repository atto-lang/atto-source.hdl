# Oreslang HDL compiler — experimental source-to-SystemVerilog

This repository now contains a **working standalone experimental source-subset compiler**. It is NOT integrated with the main Java/LLVM Oreslang compiler or common HIR/MIR, and is NOT evidence of FPGA or ASIC execution.

Supported source: one `pub fnc` or `fnc`, one or more `u1..u64` unsigned parameters, matching return type, and a single return expression using input parameters, `+`, `-` and parentheses. All operands have equal widths and arithmetic wraps modulo 2^width. Unsupported features, actors and dynamic effects fail closed.

The compiler bounds the **constructed** expression AST to 64 levels, even for
long left-associative arithmetic or bitwise chains with shallow parenthesis depth.
Over-depth source is rejected before recursive rendering, reference evaluation,
or any SystemVerilog output.

Run `npm test`. Generate RTL: `node bin/oreslang-hdl.mjs tests/fixtures/add8.ores /tmp/add8.sv`. The Node tests check 65,536 software-reference inputs; they are **not** Verilog execution. The GitHub Actions workflow separately requires Icarus RTL simulation and Yosys synthesis; only successful executed jobs are evidence.

Bootstrap CLI is positional-only. Full Oreslang command parsing must use flags-2-env. Long-term work: LLVM frontend typed AST/HIR/MIR adapter, CIRCT, fixed clocks/memories and control-flow lowering.

RFC: https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/65
Tracking: https://github.com/ores-truffle-oreslang/oreslang-source.llvm/issues/551


## Current-main proof utilities retained

This source-to-RTL slice is layered on the current HDL main branch and retains
the existing hardware width/banking proof modules, optimization-intent
preflight, integration manifest, and their tests. Those host-side proofs are
complementary evidence; they are not replaced by the standalone source parser.
