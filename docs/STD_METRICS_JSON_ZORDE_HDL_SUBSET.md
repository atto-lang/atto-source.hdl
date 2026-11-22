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


## Core loan-safety preflight and compiler borrow boundary

- `core/borrow_admission.atto` is a bounded unique-owner loan-state
  **diagnostic/runtime preflight** with a 65,535-reader quota, not the
  compiler borrow checker and not an owner/borrow capability.
- `contracts/core-borrow-preflight-v1.json` pins 13 scalar truth-table
  states; `tests/core-borrow-preflight-source.test.mjs` checks the source
  preflight and explicitly forbids source-only borrow PASS.
- HDL retains only pure scalar policy; dynamic owner provenance, actor domains and NLL remain unverified target capabilities.
- The compiler remains responsible for readonly/exclusive provenance,
  last-use/CFG lifetime, no move under a live loan, nonescaping return,
  actor/task/await boundaries, exception/cancel cleanup and no generated
  guest artifact for rejected source. A helper returning `true` never
  authorizes bypassing those checks.
- Histogram snapshot construction now validates the bucket inventory,
  copies caller-owned arrays and keeps the constructor module-private.
  This prevents mutable aliases at the stdlib boundary independent of
  whether an implicit-borrow migration profile is available.
- The backend stages this core source and borrow fixtures; namespace resolution, typed compiler borrow diagnostics and guest execution remain pending.
