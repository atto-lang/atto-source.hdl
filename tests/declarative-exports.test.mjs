import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource} from '../src/compiler.mjs';

const source='fnc sum(u8 a, u8 b): u8 { return a + b; }';
test('HDL accepts public export at start and end of source',()=>{
  const top=compileSource('export pub fnc sum;\n'+source);
  const bottom=compileSource(source+'\nexport pub sum;');
  assert.equal(top.systemVerilog,bottom.systemVerilog);
  assert.match(top.systemVerilog,/module ores_sum\(/);
});
test('HDL rejects unknown, duplicate, class and package-only exports',()=>{
  for(const [declaration,code] of [
    ['export pub Missing;','HDL_EXPORT_UNBOUND'],
    ['export pub sum; export pub fnc sum;','HDL_EXPORT_DUPLICATE'],
    ['export pub class sum;','HDL_EXPORT_KIND_UNSUPPORTED'],
    ['export pub[pkg] fnc sum;','HDL_PACKAGE_EXPORT_UNSUPPORTED'],
  ]){
    assert.throws(()=>compileSource(declaration+'\n'+source),e=>e?.code===code,declaration);
  }
});
