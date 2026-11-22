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
