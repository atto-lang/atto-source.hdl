# std/time compiler and RTL admission status

`stdlib/std/time.atto` records the backend-owned value/time contract, but
the current stage-0 HDL compiler only supports a bounded, combinational
unsigned `u1..u64` arithmetic subset. Its arithmetic wraps modulo the
bitwidth; this does **not** implement checked signed-64 Duration, monotonic
Instant domains, cancellable Timer, sleeping actors, or async suspension.

`tests/std-time-admission.test.mjs` uses the **actual compiler** to ensure
full `std/time` module imports, class declarations and attempted sleep
calls fail closed. A separate positive compiled and interpreted RTL
example proves that existing unsigned arithmetic still works, while
explicitly exhibiting wraparound rather than advertising safe durations.

A real HDL timing subset will require a clock-domain-typed synchronous
hardware design, saturating or checked tick counters, overflow signaling,
reset and cross-domain synchronization. It must not synthesize an OS
monotonic clock or JS/Java scheduler. Native hardware timing conformance
remains NOT VERIFIED.
