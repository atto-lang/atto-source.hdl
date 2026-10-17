#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { compileSource } from "../src/compiler.mjs";

function parse(argv) {
  const allowed = new Set(["input", "output", "entry", "target", "emit"]);
  const options = {};
  for (const arg of argv) {
    const m = /^--([a-z]+)=(.+)$/.exec(arg);
    if (!m || !allowed.has(m[1]) || m[1] in options) {
      throw new Error("unsupported, malformed or duplicate argument: " + arg);
    }
    options[m[1]] = m[2];
  }
  if (!options.input || !options.output || !options.entry) throw new Error("need --input, --output and --entry");
  if (!["fpga", "asic"].includes(options.target)) throw new Error("target must be fpga or asic");
  if (!["verilog", "systemverilog"].includes(options.emit)) throw new Error("emit must be verilog or systemverilog");
  return options;
}
try {
  const opts = parse(process.argv.slice(2));
  const source = await readFile(opts.input, "utf8");
  const result = compileSource(source, {entry: opts.entry});
  await mkdir(dirname(opts.output), {recursive: true});
  await writeFile(opts.output, result.verilog, "utf8");
  process.stdout.write("emitted " + result.module + " (" + result.width + " bits) to " + opts.output + "\n");
} catch (error) {
  process.stderr.write(String(error.message) + "\n");
  process.exitCode = 1;
}
