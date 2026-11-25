import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';
test('metrics, Zorde and loan preflight sources do not imply HDL library linkage',()=>{
 for(const path of ['std/json','std/zorde','std/metrics','atto.std/metrics_scalar','atto.std/zorde_varuint31','atto.core/borrow_admission']){
  const src='import module lib from "'+path+'"; fnc pass(u8 a):u8{return a;}';
  for(const compile of [parseHardwareSource,compileSource])
   assert.throws(()=>compile(src),e=>e instanceof HardwareSourceError&&e.code==='HDL_LIBRARY_PROFILE_UNSUPPORTED');
 }
 for(const path of ['stdlib/core/borrow_admission.atto','stdlib/std/metrics_scalar.atto','stdlib/std/zorde_varuint31.atto'])
  assert.throws(()=>compileSource(readFileSync(new URL('../'+path,import.meta.url),'utf8')),HardwareSourceError);
 assert.match(compileSource('fnc pass(u8 a):u8{return a;}').systemVerilog,/module ores_pass/);
});
