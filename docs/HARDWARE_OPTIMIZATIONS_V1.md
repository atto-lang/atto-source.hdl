# Oreslang synthesizable optimization roadmap v1

Status: **design and acceptance scaffold only**. This file does not imply a hardware compiler optimization is implemented or any real FPGA/ASIC timing closed. The existing `README.md` limits source-to-RTL to a typed fixed-width arithmetic prototype.

Tracking: [II/loop pipeline #4](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/4), [banking #5](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/5), [bit widths #6](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/6), [spatial unroll #7](https://github.com/ores-truffle-oreslang/oreslang-source.hdl/issues/7).

## Non-negotiable admission and semantics
- Hardware compilation uses only the explicit target profile and the admitted static subset; arbitrary LLVM IR/heap allocations, actors, OS I/O, async, unbounded loops, pointer aliasing or dynamic recursion must **fail closed**.
- Semantics are finite bit-vectors: source widths signedness, overflow, shift, truncation, comparison, and static initialization must be explicit, not inferred from software-native `int` without a proof.
- RTL must be independently simulated, checked against an executable reference model, and synthesized. Results must be separately labeled as simulation, synthesis, P&R, physical signoff or board verification.
- Any transformation must preserve valid/ready transfer, reset, in-order responses, and backpressure; no implicit dropping/duplicating transactions.

## Dependency graph

```
fixed-width typed HW IR + signedness/range contracts
    -> exact-width lowering/proof (#6)
    -> static memory layout + read/write collision semantics (#5)
    -> loop dependence and schedule IR (#4)
    -> optional spatial unroll with replicated ALUs + bank-port checks (#7)
    -> cycle-accurate RTL simulation + independent equivalence
    -> target specific FPGA/ASIC synthesis and physical evidence
```

### 1. Exact width specialization (#6)
- Define `uint<N>` and `int<N>` as **hardware-only** semantic types behind target admission, never an implicit change in ordinary Oreslang integers.
- Range inference must use proven finite loop bounds and explicit checked math. Never narrow when overflow/rounding could alter a result.
- Exhaustive finite input truth-table validation at 1..8 bits; fuzz larger widths, signed negative extrema, mixed-width operations, shifts and wrap/trap policy.
- Record synthesized gate/LUT/critical-path changes; do not promise gate-count or power reductions from datatype size alone.

### 2. Banked static memory (#5)
- Define address-to-bank function, bank count, port count, arbitration/collision semantics, read latency and synchronous reset/initialization.
- For each scheduled cycle and bank, prove accesses do not exceed physical ports or enforce deterministic arbitration, possibly raising II.
- Test 1/2/4 banks, both conflict-free and aliased addresses, simultaneous reads and writes, and out-of-bounds rejection.
- BRAM/LUTRAM/flip-flop mapping is tool- and device-dependent; preserve generic RTL with target-specific mapping evidence.

### 3. Loop pipeline (#4)
- Only finite statically counted loops with fully analyzed dependence distance and initiation constraints; specify II and latency separately.
- Output uses an explicit transaction validity mechanism; define occupancy and reset flush.
- Build a schedule feasibility checker, not a magic `II=1` switch. Cyclic recurrences or memory conflicts must increase II or be rejected.
- Simulation checks II under continuous traffic, tails, stalls and reset mid-flight; formal checks bound latency and no duplicate/lost transactions.

### 4. Spatial unrolling (#7)
- Candidate factors 1/2/4 for a finite static loop, with exact tail/predication semantics and replicated per-lane arithmetic.
- Unroll cannot exceed a declared LUT/DSP/FF/BRAM budget. An infeasible mapping must reject or report infeasible, never silently degrade while claiming requested factor.
- Respect memory banking port proofs; unrolled operators are not evidence of greater throughput if bandwidth or clock changes dominate.
- Compare full/partial unroll with loop dependence tests and post-synthesis resource results.

## Baseline kernels and assertions

| Kernel | Main property | Negative gate |
| --- | --- | --- |
| 8-bit add (existing bootstrap) | exact RTL truth table | reject unsupported type/effect |
| bounded sum with proven narrow counter | exact overflow and width | reject range proof failure |
| independently processed 4-lane map | stable order and II | reject unsafe loop-carried dependence |
| 2-bank strided read | no address/port collision | reject or arbitrate alias conflict |
| 4-way spatial map | exact output after backpressure | resource budget exhaustion |

## Required evidence to leave draft
- [ ] Typed compiler IR + verifier for each of the four passes, with fail-closed feature admission
- [ ] Reference model and positive/negative HDL simulation fixtures
- [ ] Property/equivalence tests at widths, loop tails, stalls, reset and dependent iterations
- [ ] FPGA/ASIC resource and timing reports with explicit toolchain, design and target hashes
- [ ] Cross-repo pinned contract with oreslang-common-source and target-profile schema
- [ ] No FPGA bitstream, physical timing or fabricated silicon claim without corresponding evidence


## Implemented standalone width-proof prototype (draft PR #8)

The branch now contains `src/hardware-width-proof.mjs` and `tests/hardware-width-proof.test.mjs`, with `npm test` (Node 22). This is a **host-side, compiler-independent range-proof library**, not RTL emission or a source-language feature.

- `proveBoundedCounter` computes the minimum unsigned width needed for every static counter value **including** the terminal bound: a maximum of 100 requires 7 bits.
- `proveNarrowArithmetic` supports interval proofs for add/subtract/multiply with explicit signedness, 1..128-bit original type and explicit FPGA/ASIC target.
- All operand pairs are enclosed by a checked mathematical result interval. Operations that can overflow the original type reject rather than secretly adopting widening, wrapping or trap semantics.
- Result widths are selected only after proving the complete interval fits; unknown/dynamic ranges, CPU target, mismatched operand types and invalid bit budgets reject.
- Tests compare exhaustive 1..8-bit unsigned and 1..6-bit signed concrete operands against the range result and expected overflow rejection. Local `npm test`: 5 passing tests.
- CI workflow `.github/workflows/width-proof.yml` runs **proof self-tests only**. CI status is not evidence of synthesizable SystemVerilog.

Remaining for #6: integrate the proof into compiler HIR/RTL lowering, define real syntax/type policy, emit independently verified SystemVerilog, exhaustively simulate small widths, synthesize and compare mapped area/timing under explicit toolchains. Do not mark the hardware optimization implemented until those gates pass.

## Static banking proof implemented (issue #5)

This draft now includes `src/hardware-bank-proof.mjs` and `tests/hardware-bank-proof.test.mjs`. The helper admits only **exact static integer addresses**, bounded cycle schedules and explicit FPGA/ASIC target/port configurations. It maps each address to `address % bankCount`, enforces per-bank read/write/total physical port limits, and rejects write/write and read/write collisions at one address within a clock cycle. Unknown aliasing or dynamic addresses fail closed instead of guessing arbitration semantics. All admitted schedules preserve input access ordering.

A locally executed Node 22 run of the **exact Git blob contents** passed 6/6 tests; exhaustive two-access bank mapping cases covered 1, 2 and 4 banks and tested both conflict-free and oversubscribed schedules. This is a static *admission proof*, **not** BRAM mapping, Verilog generation, a synthesis report, or proof of any initiation interval. To complete issue #5: integrate with typed HIR, choose collision/read-during-write semantics by physical RAM primitive, lower to RTL, run dynamic-address arbitration/equivalence fixtures and synthesize with actual device resource reports.

**Private CI policy:** Some existing cross-organization private-source mirror paths are under active security incident hold (conformance #22/#77 and PR #86). No confidential Oreslang source may be transferred to an alternative Actions organization until independently approved protected-main exact-snapshot export policy and source incident clearance exist. Locally executed source-free tests do not satisfy GitHub Actions code-review release gates.
