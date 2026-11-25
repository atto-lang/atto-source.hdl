import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';
test('performance policy cannot be mistaken for executable HDL or hosted instrumentation',()=>{
 for(const path of ['std/perf','atto.std/perf','atto.core/perf_policy']){
  const src='import module perf from "'+path+'"; fnc pass(u8 a):u8{return a;}';
  for(const compile of [parseHardwareSource,compileSource])
   assert.throws(()=>compile(src),e=>e instanceof HardwareSourceError&&e.code==='HDL_LIBRARY_PROFILE_UNSUPPORTED');
 }
 for(const path of ['core/perf_policy.atto','stdlib/perf.atto','stdlib/perf_counter_slots.atto','stdlib/perf_ids.atto'])
  assert.throws(()=>compileSource(readFileSync(new URL('../'+path,import.meta.url),'utf8')),HardwareSourceError);
 assert.match(compileSource('fnc pass(u8 a):u8{return a;}').systemVerilog,/module ores_pass/);
});
