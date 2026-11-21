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
`HDL_WIDTH` gate. The return-first form must not specify a redundant trailing
`: type`. No implicit casts, Error/Result handling, actor scheduling,
asynchronous suspension, or target-specific codegen bypass is introduced.
The previously implemented bang exceptional-control rejection is preserved.

Run `node --test tests/return-first-headers.test.mjs`. Successful Node
parser/reference checks prove only this bounded HDL frontend source path;
actual Verilog toolchain evaluation and GitHub runner/CI admission must be
attested separately on the exact commit before broader backend parity claims.

This branch is stacked on the existing HDL exceptional-keyword PR #21 to
avoid competing lexer edits; merge/review the parent dependency first.
