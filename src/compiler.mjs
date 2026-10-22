import {types as nodeTypes} from "node:util";

// Compiler policy input is JSON-like authority, never an executable host object.
// Snapshot the single supported option before parsing any user source.
function admittedEntryOption(options) {
  if (options === null || typeof options !== "object" || nodeTypes.isProxy(options))
    reject("H007", "options must be an unproxied plain data object");
  const proto = Object.getPrototypeOf(options);
  if (proto !== Object.prototype && proto !== null)
    reject("H007", "options must have a plain prototype");
  const keys = Reflect.ownKeys(options);
  if (keys.length > 1 || (keys.length === 1 && keys[0] !== "entry"))
    reject("H007", "unsupported compiler option keys");
  if (keys.length === 0) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(options, "entry");
  if (!descriptor || !Object.hasOwn(descriptor, "value") ||
      typeof descriptor.value !== "string" || !identifier(descriptor.value))
    reject("H007", "entry must be an own plain identifier string");
  return descriptor.value;
}

// Explicitly bounded combinational prototype, not a general Oreslang frontend.
export class HardwareEligibilityError extends Error {
  constructor(code, message) {
    super(code + ": " + message);
    this.name = "HardwareEligibilityError";
    this.code = code;
  }
}
const reject = (code, message) => { throw new HardwareEligibilityError(code, message); };
const forbidden = new Set(["module", "endmodule", "input", "output", "wire", "reg", "logic", "assign", "always", "generate", "endgenerate", "begin", "end", "result", "if", "else", "for", "while", "case", "function", "task", "parameter", "localparam", "integer", "signed", "unsigned", "default", "initial", "final", "interface", "package", "import", "export", "time", "tri", "wand", "wor", "supply0", "supply1"]);
const identifier = (s) => /^[A-Za-z_][A-Za-z_0-9]*$/.test(s) && !forbidden.has(s.toLowerCase());

// Only a single, two-argument, same-width unsigned return expression is eligible.
// This narrow parser is intentionally independent from (not a replacement for) the
// Oreslang typed frontend; a verified frontend adapter must replace it for H1.
export function compileSource(source, options = {}) {
  const entry = admittedEntryOption(options);
  if (typeof source !== "string" || source.length > 65536 || source.includes("\0") || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(source)) {
    reject("H001", "invalid source size or encoding");
  }
  const pattern = /^\s*(?:pub\s+)?fnc\s+([A-Za-z_][A-Za-z_0-9]*)\s*\(\s*(u(?:[1-9]|[1-5][0-9]|6[0-4]))\s+([A-Za-z_][A-Za-z_0-9]*)\s*,\s*(u(?:[1-9]|[1-5][0-9]|6[0-4]))\s+([A-Za-z_][A-Za-z_0-9]*)\s*\)\s*:\s*(u(?:[1-9]|[1-5][0-9]|6[0-4]))\s*\{\s*return\s+([A-Za-z_][A-Za-z_0-9]*)\s*([+&|^-])\s*([A-Za-z_][A-Za-z_0-9]*)\s*;\s*\}\s*$/;
  const match = pattern.exec(source);
  if (!match) reject("H002", "unsupported syntax/effects; expected one fixed-width binary return function");
  const [, name, leftType, left, rightType, right, resultType, lhs, op, rhs] = match;
  if (![name, left, right].every(identifier) || new Set([name, left, right]).size !== 3) {
    reject("H003", "invalid/reserved/duplicate identifier");
  }
  if (entry !== undefined && entry !== name) reject("H004", "entrypoint mismatch");
  if (leftType !== rightType || leftType !== resultType) {
    reject("H005", "mixed-width arithmetic and implicit conversion forbidden");
  }
  if (![left, right].includes(lhs) || ![left, right].includes(rhs)) {
    reject("H006", "expression refers to unknown argument");
  }
  const width = Number(leftType.slice(1));
  // Every accepted operation uses unsigned fixed-width modular bitvector semantics.
  const range = "[" + (width - 1) + ":0]";
  const verilog = [
    "// Generated from bounded Oreslang hardware subset; unsigned modulo 2^" + width,
    "module " + name + " (",
    "  input wire " + range + " " + left + ",",
    "  input wire " + range + " " + right + ",",
    "  output wire " + range + " result",
    ");",
    "  assign result = " + lhs + " " + op + " " + rhs + ";",
    "endmodule",
    ""
  ].join("\n");
  return { module: name, width, op, verilog };
}
