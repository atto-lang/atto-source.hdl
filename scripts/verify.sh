#!/usr/bin/env bash
set -euo pipefail
for tool in node iverilog vvp yosys; do
  command -v "$tool" >/dev/null || { echo "REQUIRED_TOOL_MISSING: $tool" >&2; exit 2; }
done
mkdir -p build
node bin/ores-hdl.mjs --target=fpga --entry=add8 --emit=verilog --input=examples/add8.ores --output=build/add8.v
iverilog -g2012 -s add8_tb -o build/add8.sim build/add8.v tests/add8_tb.sv
vvp build/add8.sim | tee build/rtl_sim.log
grep -q 'PASS: 65536 RTL vectors' build/rtl_sim.log
yosys -Q -T -l build/yosys.log -p 'read_verilog build/add8.v; hierarchy -check -top add8; synth -top add8; check -assert; stat'
sha256sum examples/add8.ores build/add8.v | tee build/sha256.txt
