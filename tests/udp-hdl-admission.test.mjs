import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';
test('UDP policy source does not grant socket access or produce unsupported RTL',()=>{
 for(const path of ['std/net/udp','atto.std/net/udp','std.net.udp']){
  const src='import module udp from "'+path+'"; fnc pass(u8 a):u8{return a;}';
  for(const compile of [parseHardwareSource,compileSource])
   assert.throws(()=>compile(src),e=>e instanceof HardwareSourceError&&e.code==='HDL_LIBRARY_PROFILE_UNSUPPORTED');
 }
 for(const path of ['tests/fixtures/udp-policy-main.atto','tests/fixtures/udp-boundary-adversarial.atto','tests/fixtures/udp-stream-budget-main.atto','stdlib/net/udp.atto','stdlib/net/udp_stream_budget.atto'])
  assert.throws(()=>compileSource(readFileSync(new URL('../'+path,import.meta.url),'utf8')),HardwareSourceError);
 assert.match(compileSource('fnc pass(u8 a):u8{return a;}').systemVerilog,/module ores_pass/);
});
