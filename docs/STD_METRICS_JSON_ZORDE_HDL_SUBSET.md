# HDL std metrics/JSON/Zorde — synthesizable subset stage

The HDL backend **must not** claim full stdlib parity for dynamic JSON,
heap-based metrics registries or Zorde frame/graph serialization. Those
features require independently reviewed target capabilities or explicitly
enforced unsupported diagnostics before native HDL synthesis.

Staged native `.atto` scalar policies:
- `stdlib/std/metrics_scalar.atto`: bounded counter additions,
  inclusive gauge bounds and two-bound histogram bucket classification.
- `stdlib/std/zorde_varuint31.atto`: canonical unsigned varuint31
  byte-length preflight and signed ZigZag31 scalar encoding.

Source-only reference: `contracts/std-metrics-json-zorde-hdl-subset-v1.json`,
with 26 bounded input/output vectors, and
`tests/std-metrics-json-zorde-hdl-source.test.mjs`.

```sh
node --test tests/std-metrics-json-zorde-hdl-source.test.mjs
```

This verifies the scalar model and staged Atto text, **not** any Atto
compiler, Verilog/VHDL output or RTL simulator. Future work:
1. Compile these exact source files with the HDL parser/typechecker to
   synthesizable combinational RTL, with no host emulation.
2. Compare simulator output to the exact scalar vectors including malformed
   bounds, varuint31 max, and ZigZag31 min/max.
3. Prove the target rejects unsupported dynamic `std/json`,
   `std/zorde` frames and heap-backed `std/metrics` APIs with stable
   diagnostics. Do not use a generic unresolved import diagnostic as a
   substitute for profile-specific rejection.
4. Record exact source/compiler heads/trees, vector checksum, nonzero
   execution steps, simulation artifacts and negative compilation receipts.

Until independently executed, all HDL feature statuses remain
`NOT_EXECUTED` or `CAPABILITY_REVIEW_REQUIRED`, never `PASS`.
