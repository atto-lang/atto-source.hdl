# Static optimization intent, **not** hardware synthesis

This experimental preflight contributes to [II/pipeline #4](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/4), [banking #5](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/5), [bit width #6](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/6), [unrolling #7](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/7) and [org epic](https://github.com/ores-truffle-oreslang/.github/issues/5).

```sh
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
