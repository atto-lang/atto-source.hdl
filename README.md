# Oreslang HDL compiler (experimental)

This is a **bounded, independent combinational prototype** for the hardware
contract in [common-source PR #65](https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/65).
It is **not** the actual Oreslang AST/typechecked compiler frontend, and it
cannot compile general Oreslang, actors, OTP, or portable CPU binaries.

Implemented slice: exactly one two-argument function
\`fnc name(uN a, uN b): uN { return a + b; }\` with N in 1..64 and
operators \`+ - & | ^\`, identical operand/output widths, modulo 2^N
unsigned results. All other syntax fails closed. No OS requirement is
introduced into Oreslang \`core\`: Node, Icarus and Yosys are **host
build tools**, not target runtime dependencies.

Run \`npm test\` for source and rejection tests. Run \`bash scripts/verify.sh\`
for generated RTL, exhaustive 65,536-vector Icarus Verilog simulation and
Yosys synthesis (tool absence fails). CI uploads actual logs and SHA-256.
Passing RTL tests does **not** establish native guest compiler integration,
stateful circuits, FPGA timing/bitstream, ASIC place-and-route, or silicon.

Next: replace the temporary text admission parser with an adapter from the
real typed/effect-checked Oreslang frontend, then validate differential
software semantics and signed arithmetic before expanding the subset.
