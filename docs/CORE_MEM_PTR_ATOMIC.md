# HDL candidate: Atto freestanding memory layout and order policies

Compiler-local `.atto` sources at `stdlib/core/mem.atto`,
`stdlib/core/ptr.atto`, and `stdlib/core/atomic.atto` define pure
checked scalar preflight rules, not synthesizable modules.

`mem` checks alignment/stride/bounded bytes; `ptr` checks
region-relative byte span/index arithmetic, not physical pointers;
`atomic` validates ordering codes 0..4 and CAS failure restrictions.

**Hardware boundary:** HDL cannot infer CPU acquire/release/seq_cst,
coherent caches, cross-clock domain synchronization, interconnect fencing,
physical memory atomicity, or an actor ownership model from these helpers.
No pointer or Atomic<T> runtime behavior, RTL generation, memory macro,
clock-domain crossing, hardware fence, shared memory or guest side effect
is supplied. HDL's current guest library import support may explicitly
reject these files; that fail-closed behavior must be retained.

The local `tests/core-memory-policy-source.test.mjs` test is a
restricted 63-case source-only scalar validation. It is not HDL elaboration,
simulation, formal verification or hardware proof. Any future enabling
requires compiler-admitted `.atto` guest, generated RTL equivalence,
negative fixtures, CDC/formal checks and executed exact-head CI.
Keep this PR Draft.

Related Java #1771, LLVM #873/#801, Rust #537/#419, atomic spec #175
and pointer design conflicts #18/#154.
