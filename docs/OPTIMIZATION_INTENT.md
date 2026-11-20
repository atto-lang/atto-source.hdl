# Static optimization intent, **not** hardware synthesis

This experimental preflight contributes to [II/pipeline #4](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/4), [banking #5](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/5), [bit width #6](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/6), [unrolling #7](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/7) and [org epic](https://github.com/ores-truffle-oreslang/.github/issues/5).

```sh
cargo test --offline --manifest-path tools/hls-intent-preflight/Cargo.toml
cargo run --offline --manifest-path tools/hls-intent-preflight/Cargo.toml -- examples/bounded_add.intent.json

# Temporary independent comparison oracle until exact-head Rust execution is verified:
python3 tools/validate_optimization_intent.py examples/bounded_add.intent.json
python3 -m unittest discover -s tests -p 'test_*.py'
```

**What it checks:** bounded static loop count, declared unroll factor, exact
width/range, conservative loop-dependence admission and simple interleaved
bank read-port conflicts for *explicitly supplied* concurrent read indices.
Unknown manifest properties fail closed. A runtime-selected array index,
unmodeled write hazards or unspecified access is **not proven safe** by an
empty list of read indices. This tool never consumes `.ores` source code.

**What it does not check:** actual HLS schedule, pipeline registers/ready-valid
backpressure, RTL functionality, resource utilization, P&R timing, ASIC PPA or
proof of II=1. Report status is always `STATIC_PREFLIGHT_ONLY` even for
`target_ii=1`. A real source/IR emitter must reject hidden memory accesses,
false ownership/alias assumptions and effectful operations. The next PRs must
add synthesizable typed IR, emitted RTL, independent simulation/equivalence
and actual synthesis evidence. No production FPGA/ASIC target is enabled here.

### Rust migration and security boundary

The Rust preflight is a standalone, dependency-free **Linux-only** CLI with
bounded JSON depth and length, decoded-key duplicate rejection, full 128-bit
integer boundary checks, SystemVerilog identifier checks, fail-closed read
port accounting, and `O_NOFOLLOW | O_NONBLOCK` regular-file admission.
The Python checker and its adversarial tests are retained temporarily so CI
can compare both implementations on the same reviewed manifest. They are
not deleted until exact-head executions and negative differential coverage
establish an adequate migration. No compiler, RTL, timing, or PPA claims.
