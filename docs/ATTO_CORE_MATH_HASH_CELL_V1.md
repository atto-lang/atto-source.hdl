# HDL core math/hash/cell (source ownership / explicit unsupported)

The canonical HDL backend compiles only a **fixed-width combinational**
hardware subset (u1..u64, no general imports). These three independently
owned `library/atto.core/*.atto` modules are source candidates only;
the RTL compiler MUST reject attempts to import them, not emit a silent
hardware substitute. A Node test pins exact source Git blobs and checks
that imports remain rejected while an ordinary u8 XOR source still
synthesizes to SystemVerilog.

- Math uses signed checked i64 and is not yet representable as the
  backend's unsigned truncating arithmetic without a typed i64 proof.
- Hash is noncryptographic modulo-prime byte folding; no RTL pipeline,
  loop or bit-accurate hardware implementation is claimed.
- Cell expresses borrowing policy only; the backend has no
  generic Cell<T>, RefCell<T>, actor state or atomic loan authority.

Promotion requires a reviewed cost/area/latency bound, explicit width
semantics, accurate module linking/constant-time lowered logic where
appropriate, HDL source-to-RTL + simulator witness and negative tests.
Current status UNSUPPORTED / guest NOT_EXECUTED, not general parity.
Existing fail-closed import PR #50 must be preserved.
