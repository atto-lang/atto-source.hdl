# Oreslang HDL compiler (experimental)

Oreslang-to-hardware compiler prototype. All features are experimental and bounded. See https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/65 for the proposed normative contract.

Initial goal: typed fixed-width arithmetic -> synthesizable SystemVerilog with deterministic semantics, fail-closed compilation and independent tests. This is not a general LLVM-IR-to-RTL compiler. No FPGA/ASIC silicon readiness is implied.
