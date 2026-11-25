# Secure selectable actor DATA codecs — hdl target draft

DESIGN_ONLY_NOT_EXECUTED. See canonical https://github.com/atto-lang/atto-spec/pull/228 and 22-case conformance https://github.com/atto-lang/atto-platform-conformance/pull/586.

Reject unsupported dynamic codecs at compile time. Only admit static-width, synthesis-compatible bounded profiles with explicit trusted transport interface; no unbounded parser or hidden host fallback.

Preserve Sendable for local borrow/move/checked copy, separate Serializable per schema/format for DATA. MessagePack default on new serialized endpoints, Protobuf and CBOR first-class where supported, FlatBuffers optional verified immutable buffers. Preserve existing wire contracts. Reject unavailable codec/version, downgrade, implicit fallback and unauthorized schema/tenant/generation. Sealed runtime CONTROL is never user-serializable. No raw pointers, host or codec objects, reflection or arbitrary instantiation. Require bounded frame/expanded bytes, parser work, depth, collection sizes, credits and exactly-once rollback before enqueue; no partial publication.

Before any executable codec implementation or support claim: reconcile overlapping and mapped legacy PRs; document target capability gates, implement only reviewed bounded profiles, run actual target-specific positive and negative fixtures including malformed input, forged capabilities, stale generations, quota and cancellation tests, record exact tree/toolchain and independent security review. Host-only/source-only/zero-step tests do not establish guest conformance. No feature support is claimed.

## Current target decision

The current scalar HDL backend has no actor DATA transport or codec linker. All dynamic codec selection and hosted serialization imports remain unsupported. This change records a design boundary only; it does not authorize new codec implementations or weaken sealed CONTROL isolation. The accompanying negative compiler test covers profile rejection, not codec security or runtime conformance.
