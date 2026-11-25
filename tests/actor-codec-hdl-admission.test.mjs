import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';
test('actor codec selection design does not imply executable HDL transport',()=>{
 for(const path of ['std/codec','atto.std/codec','std/serialization','atto.std/serialization']){
  const src='import module codec from "'+path+'"; fnc pass(u8 a):u8{return a;}';
  for(const compile of [parseHardwareSource,compileSource])
   assert.throws(()=>compile(src),e=>e instanceof HardwareSourceError&&e.code==='HDL_LIBRARY_PROFILE_UNSUPPORTED');
 }
 assert.throws(()=>compileSource('define actor Worker as end'),HardwareSourceError);
 assert.match(compileSource('fnc pass(u8 a):u8{return a;}').systemVerilog,/module ores_pass/);
});
