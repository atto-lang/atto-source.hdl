import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseHardwareSource,compileSource} from '../src/compiler.mjs';
test('exact portable state fixtures fail closed before RTL emission',async()=>{
  for(const name of ['state-short-intrinsics.atto','state-owned-tuple-snapshot.atto','state-write-expressions.atto']){
    const source=await readFile(new URL('fixtures/state-intrinsics-v1/'+name,import.meta.url),'utf8');
    for(const compile of [parseHardwareSource,compileSource])
      assert.throws(()=>compile(source),e=>e.code==='HDL_STATE_CONTAINER_UNSUPPORTED',name);
  }
});
test('declaration spelling and comment trivia preserve denial; combinational control remains',()=>{
  for(const prefix of ['define state container','pub define state container','define pub state /* nested /* x */ */ container'])
    assert.throws(()=>compileSource(prefix+' C as end'),e=>e.code==='HDL_STATE_CONTAINER_UNSUPPORTED',prefix);
  const r=compileSource('fnc f(u8 a): u8 { /* define state container C */ return a; }');
  assert.match(r.systemVerilog,/module /);
});
