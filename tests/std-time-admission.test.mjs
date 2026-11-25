import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {compileSource,HardwareSourceError,evaluateReference} from '../src/compiler.mjs';

test('HDL backend refuses full class-based std/time instead of emitting fake RTL',async()=>{
  const source=await readFile(new URL('../stdlib/std/time.atto',import.meta.url),'utf8');
  assert.match(source,/define module time as/);
  assert.match(source,/define pub class Duration as/);
  assert.throws(()=>compileSource(source),
    e=>e instanceof HardwareSourceError && e.code.startsWith('HDL_'));
});
test('HDL backend refuses module-qualified time imports and any scheduler sleep',()=>{
  for(const src of [
    'import module time from "std/time"; pub fnc main(u64 ticks):u64 { return ticks; }',
    'pub fnc sleep(u64 ticks):u64 { return time.sleep(ticks); }',
    'pub fnc time_now(u64 ticks):u64 { await time.sleep(ticks); return ticks; }'
  ]) {
    assert.throws(()=>compileSource(src),
      e=>e instanceof HardwareSourceError && e.code.startsWith('HDL_'));
  }
});
test('deterministic u64 arithmetic remains executable but wraps, not a safe Deadline API',()=>{
  const {program,systemVerilog}=compileSource(
    'pub fnc tick_add(u64 ticks,u64 delta):u64 { return ticks + delta; }');
  assert.match(systemVerilog,/assign out_result = \(in_ticks \+ in_delta\);/);
  assert.equal(evaluateReference(program,{ticks:3n,delta:4n}),7n);
  assert.equal(evaluateReference(program,{ticks:18446744073709551615n,delta:1n}),0n);
  // Overflow-wrapping RTL arithmetic must not be misreported as the checked
  // signed-64 std/time Deadline contract.
});
