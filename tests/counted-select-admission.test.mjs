import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';
test('typed and counted select cannot emit a combinational RTL artifact',()=>{
  for(const prefix of ['select','nb select','await select','await nb select'])
    for(const header of ['(3)','<int>(3)',' /* count */ (0)','(-1)','(true)','(1 + 2)'])
      for(const body of ['{ default: -> { return a; } }','over default: -> { return a; } end']) {
        const source='pub fnc f(u8 a):u8 { return '+prefix+header+' '+body+'; }';
        for(const compiler of [compileSource,parseHardwareSource])
          assert.throws(()=>compiler(source),e=>e instanceof HardwareSourceError && e.code==='HDL_SELECT_UNSUPPORTED',source);
      }
});
test('inert nested comments and longer names preserve scalar RTL',()=>{
  assert.doesNotThrow(()=>compileSource('pub fnc selection(u8 a): u8 { /* select<int>(3) /* inner */ */ return a; }'));
  assert.doesNotThrow(()=>compileSource('pub fnc select(u8 a): u8 { return a; }'));
});
