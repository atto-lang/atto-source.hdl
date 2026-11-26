# Hardware backend core Option/Result

**Status: SOURCE_CANDIDATE / NOT_SYNTHESIZED / NOT_VERIFIED.** These two
backend-owned AttoLang sources specify proposed pure, concrete scalar
specializations. They are not installed HDL core libraries, generated RTL,
or evidence of support for nominal ADTs in the current hardware compiler.

Portable behavior: Some(0) differs from None; Ok(0) differs from Err(0);
map modifies the active success payload only; the Err payload is preserved;
unwrap_or uses fallback only on the inactive/success-failure branch; signed
arithmetic uses checked AttoLang semantics.

Proposed **design to validate**, not approved ABI: 1-bit discriminant plus
a signed payload bus, with poison/masking of inactive bits. No implicit
host Optional/Either, no heap or actor scheduler.

Before claiming hardware support: implement closed-world nominal ADT
typechecker and tagged MIR/RTL lowering, prove inactive-payload masking,
reset/unknown-bit handling, checked overflow behavior, provide positive and
negative compiler guest outputs, synthesize and simulate against an RTL
testbench, verify area/latency and exact-head stepful CI. Generic closures,
transposes, allocations, throw/raise and scheduler effects remain unsupported.

## Borrow and affine capability classification (source-only)

HDL's proposed `Option<int>` / `Result<int,int>` are **Copy scalar
tag+payload contracts**, not source-level `borrow Option<Payload>`
or generic affine storage. Consequently this branch MUST NOT claim
borrow-safe Option/Result generics, destructor-once behavior, or
`borrow!` / `take!` compilation. That capability is explicitly
**NOT_VERIFIED** and should fail closed until a typed ownership MIR
to RTL mapping is independently established.

Before admitting read-only tag queries as an actual hardware feature,
synthesize a tagged-sum guest and verify inactive-variant masking,
defined reset semantics, and owner-safe combinational observations
in a real RTL simulation/synthesis run. A generic class/borrow parse
error alone is not a semantic ownership-checker proof. Real synthesis
and hardware simulator receipts, rather than Node source-contract checks,
are required. The all-eleven conformance matrix intentionally preserves
HDL's individual `not_executed` cells.

## Closed checked unwrap proof slice (2026-11-26)

A restricted immutable Option<int> constructor and exact trap/match with a
literal Err fallback can fold to a signed constant RTL module. The pure
Some payload is checked before the trap, preserving arithmetic failure
admission. Dynamic tags, nominal Error objects, observable Err payloads,
general Result, runtime exception control and actual synthesis remain
unsupported. Local exact compiler folding module blob
8cb36079d9ac10a51699c530c7a35bcc6b36c1fa: seven positive values, fifteen
negative cases and one existing scalar control passed in Node v22.16.0.
Full compiler-to-RTL tests were authored, not executed; no HDL simulator
or synthesis tool is available locally. This is not RTL execution proof.
