import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource} from '../src/compiler.mjs';

const source='fnc sum(u8 left, u8 right): u8 { return left + right; }';
function rejected(declaration, code) {
  assert.throws(() => compileSource(source + '\n' + declaration),
    error => error?.code === code, declaration);
}

test('trailing export is validated after source body, not silently ignored', () => {
  rejected('export pub[pkg] fnc sum;', 'HDL_PACKAGE_EXPORT_UNSUPPORTED');
  rejected('export pub class sum;', 'HDL_EXPORT_KIND_UNSUPPORTED');
  rejected('export pub fnc missing;', 'HDL_EXPORT_UNBOUND');
  rejected('export pub fnc sum;\nexport pub sum;', 'HDL_EXPORT_DUPLICATE');
});

test('a trailing public export preserves the generated RTL module', () => {
  const plain = compileSource(source).systemVerilog;
  const publicExport = compileSource(source + '\nexport pub fnc sum;').systemVerilog;
  assert.equal(publicExport, plain);
  assert.match(publicExport, /module ores_sum\(/);
});
