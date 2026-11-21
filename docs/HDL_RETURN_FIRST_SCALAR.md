# Return-first scalar declarations in the experimental HDL target

This is an incremental compiler implementation of the canonical AttoLang
return-first header syntax. It does **not** claim general AttoLang or
multi-backend guest parity.

In the bounded, non-actor, unsigned `u1..u64` HDL subset, the following
headers produce the *same parser-admitted, frozen AST* and SystemVerilog:

```atto
pub fnc add(u8 a,u8 b): u8 { return a+b; }
pub fnc u8 <- add(u8 a,u8 b) { return a+b; }
pub u8 <- add(u8 a,u8 b) { return a+b; }
pub fnc u8 • add(u8 a,u8 b) { return a+b; }
pub u8 • add(u8 a,u8 b) { return a+b; }
```

The arrow/bullet must be contiguous as a single source token; whitespace
around it is allowed. Type widths are validated using the existing HDL
`HDL_WIDTH` gate. The return-first form also admits `begin return ...; end` and the bare `return ...; end` block, with an optional single `;` or `.` immediately after an unbraced `end`, matching the native LLVM/.NET restricted parser spellings, while preserving the same frozen AST. A braced `}` never accepts this suffix; repeated suffixes fail closed. It must not specify a redundant trailing
`: type`. No implicit casts, Error/Result handling, actor scheduling,
asynchronous suspension, or target-specific codegen bypass is introduced.
The previously implemented bang exceptional-control rejection is preserved.

Run `node --test tests/return-first-headers.test.mjs`. Successful Node
parser/reference checks prove only this bounded HDL frontend source path;
actual Verilog toolchain evaluation and GitHub runner/CI admission must be
attested separately on the exact commit before broader backend parity claims.

This branch is stacked on the existing HDL exceptional-keyword PR #21 to
avoid competing lexer edits; merge/review the parent dependency first.

## Proven width inference (no implicit conversions)

Within this **bounded unsigned hardware profile only**, a return-first header
may also use `infer <- add(u8 a,u8 b)` or `infer • add(...)`. The compiler
first validates the normal expression AST and its operand widths, then sets
the exact output port width to the expression's proven width. The generated
SystemVerilog is byte-for-byte identical to an explicitly annotated function
with the same parameters. Mixed widths, missing inputs, unsupported operators,
trap effects, and hidden conversions still fail closed. This is not equivalent
to full dynamic or class/generic `infer` support on software backends.
