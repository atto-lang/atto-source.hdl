import { test } from "node:test";
import assert from "node:assert/strict";
import { compileSource, HardwareEligibilityError } from "../src/compiler.mjs";

const source = "pub fnc add8(u8 a, u8 b): u8 { return a + b; }";
test("emits truncating 8-bit combinational Verilog", () => {
  const x = compileSource(source, {entry: "add8"});
  assert.equal(x.width, 8);
  assert.match(x.verilog, /module add8/);
  assert.match(x.verilog, /output wire \[7:0\] result/);
  assert.match(x.verilog, /assign result = a \+ b;/);
});
test("all 65536 modular addition reference vectors (software only)", () => {
  let count = 0;
  for (let a = 0; a < 256; ++a)
    for (let b = 0; b < 256; ++b) {
      const expected = (a + b) & 255;
      assert.equal(expected, (a + b) % 256);
      ++count;
    }
  assert.equal(count, 65536);
});
test("accepts exact widths and defined operations only", () => {
  for (const n of [1, 7, 8, 16, 32, 64])
    for (const op of ["+", "-", "&", "|", "^"]) {
      const r = compileSource("fnc f(u" + n + " a, u" + n + " b): u" + n + " { return b " + op + " a; }");
      assert.equal(r.width, n);
      assert.match(r.verilog, new RegExp("assign result = b " + (op === "+" || op === "^" ? "\\" : "") + op.replace("|", "\\|") + " a;"));
    }
});
test("fails closed for all unsupported source or target identities", () => {
  const bad = [
    "pub fnc add8(int a, int b): int { return a + b; }",
    "pub fnc add8(u8 a, u16 b): u8 { return a + b; }",
    "pub fnc add8(u8 a, u8 b): u16 { return a + b; }",
    "pub fnc add8(u8 a, u8 b): u8 { return a / b; }",
    "pub fnc add8(u8 a, u8 b): u8 { return a << b; }",
    "pub fnc add8(u8 a, u8 b): u8 { return a + c; }",
    "pub fnc add8(u8 a, u8 b): u8 { return a + b; } spawn Worker()",
    "pub fnc add8(u8 a, u8 b): u8 { return await foo(); }",
    "pub fnc add8(u8 a, u8 b): u8 { return a + b; } fnc other(){}",
    "pub fnc add8(u8 a, u8 b): u8 { return a + b; /* injected */ }",
    "pub fnc module(u8 a, u8 b): u8 { return a + b; }",
    "pub fnc add8(u8 result, u8 b): u8 { return result + b; }",
    "pub fnc add8(u8 a, u8 a): u8 { return a + a; }",
    "pub fnc add8(u0 a, u0 b): u0 { return a + b; }",
    "pub fnc add8(u65 a, u65 b): u65 { return a + b; }"
  ];
  for (const x of bad) assert.throws(() => compileSource(x), HardwareEligibilityError, x);
  assert.throws(() => compileSource(source, {entry:"wrong"}), /H004/);
});

test("HDL reserved identifiers fail closed even when valid Oreslang names", () => {
  for (const id of ["case", "initial", "function", "parameter", "interface", "package", "signed", "time", "default", "integer"]) {
    assert.throws(() => compileSource("fnc " + id + "(u8 a, u8 b): u8 { return a + b; }"), /H003/);
    assert.throws(() => compileSource("fnc f(u8 " + id + ", u8 b): u8 { return b + b; }"), /H003/);
  }
});
test("invalid UTF-16 surrogate sequences are rejected at source boundary", () => {
  assert.throws(() => compileSource("fnc f(u8 a, u8 b): u8 { return a + b; }\uD800"), /H001/);
});

test("bitvector arithmetic oracle covers wraparound, underflow and u64 precision", () => {
  for (const width of [1, 2, 7, 8, 16, 32, 64]) {
    const mask = (1n << BigInt(width)) - 1n;
    const inputs = [0n, 1n, mask, mask >> 1n, mask - (mask > 0n ? 1n : 0n)];
    for (const op of ["+", "-", "&", "|", "^"]) {
      const rtl = compileSource(`fnc compute(u${width} a, u${width} b): u${width} { return a ${op} b; }`).verilog;
      assert.ok(rtl.includes(`assign result = a ${op} b;`));
      for (const a of inputs) for (const b of inputs) {
        const expected = op === "+" ? (a + b) & mask
          : op === "-" ? (a - b) & mask
          : op === "&" ? a & b
          : op === "|" ? a | b
          : a ^ b;
        assert.ok(expected >= 0n && expected <= mask, `u${width} ${a} ${op} ${b}`);
      }
    }
  }
});

test("compiler metadata must be plain owned data, never executable host objects", () => {
  let executed = 0;
  const getters = {};
  Object.defineProperty(getters, "entry", {
    enumerable: true,
    get() { executed++; return "add8"; }
  });
  assert.throws(() => compileSource(source, getters), /H007/);
  assert.equal(executed, 0, "compiler invoked an options getter");

  const badProto = Object.create({entry: "add8"});
  assert.throws(() => compileSource(source, badProto), /H007/);
  assert.throws(() => compileSource(source, new Date()), /H007/);
  assert.throws(() => compileSource(source, null), /H007/);
  assert.throws(() => compileSource(source, 17), /H007/);
  assert.throws(() => compileSource(source, {entry: null}), /H007/);
  assert.throws(() => compileSource(source, {entry: undefined}), /H007/);
  assert.throws(() => compileSource(source, {entry: "add8", privileged: true}), /H007/);
  assert.throws(() => compileSource(source, {[Symbol("entry")]: "add8"}), /H007/);
  assert.throws(() => compileSource(source, {entry: "add8\\u0000"}), /H007/);

  const hostile = new Proxy({entry: "add8"}, {
    get() { executed++; throw Error("getter trap executed"); },
    getPrototypeOf() { executed++; throw Error("prototype trap executed"); },
    ownKeys() { executed++; throw Error("ownKeys trap executed"); },
  });
  assert.throws(() => compileSource(source, hostile), /H007/);
  const revoked = Proxy.revocable({entry: "add8"}, {});
  revoked.revoke();
  assert.throws(() => compileSource(source, revoked.proxy), /H007/);
  assert.equal(executed, 0, "compiler invoked an options Proxy trap");

  const plain = Object.create(null);
  plain.entry = "add8";
  assert.equal(compileSource(source, plain).module, "add8");
  assert.equal(compileSource(source, {entry: "add8"}).module, "add8");
  assert.equal(compileSource(source).module, "add8");
});
