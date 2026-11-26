import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';
test('typed and counted select cannot emit a combinational RTL artifact',()=>{
  for(const prefix of ['select','nb select','await select','await nb select'])
    for(const header of ['(3)','<int>(3)',' /* count */ (0)','(-1)','(true)','(1 + 2)','(count)'])
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

// Exact shared dynamic source targets: unsupported-profile admission only.
test('exact dynamic counted sources fail closed before RTL publication',()=>{
  const fixtures=[{"name":"counted-dynamic","sha":"7c9ea9270d766612de0d502147e0df31b0dc3454"},{"name":"counted-dynamic-zero","sha":"4707b13d3daebe05ced967418ba120cf801e2d8c"},{"name":"reject-counted-dynamic-bool","sha":"36cd372a5385e34f2e3bd8dd936e4e0491052633"},{"name":"reject-counted-dynamic-unknown","sha":"0e61da7a98987ed5a182148538b35b8a890abf26"}];
  for(const f of fixtures){
    const raw=readFileSync(new URL('./fixtures/select-source-v2/'+f.name+'.atto',import.meta.url));
    assert.equal(createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex'),f.sha);
    for(const compile of [compileSource,parseHardwareSource])
      assert.throws(()=>compile(raw.toString('utf8')),f.name);
  }
});

test('mixed counted guest targets fail closed in the unsupported HDL profile',()=>{
  const fixtures=[{"name":"counted-distinct-alias-projection","sha":"5baca9bb9eb4b98500cab770888a45fb60bbf10d"},{"name":"counted-mixed-future-alias","sha":"8f57de03c9fb44eb5594c99a7095f34b702a266a"},{"name":"counted-multi-channel-fair","sha":"4b9b79b9b8670f5b282d33e63b7a4b5691c2979a"},{"name":"counted-mixed-zero","sha":"458323db6019da434b97e5b966ee646411310acf"}];
  for(const f of fixtures){
    const raw=readFileSync(new URL('./fixtures/select-source-v2/'+f.name+'.atto',import.meta.url));
    assert.equal(createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex'),f.sha);
    for(const compile of [compileSource,parseHardwareSource])assert.throws(()=>compile(raw.toString('utf8')),f.name);
  }
  assert.doesNotThrow(()=>compileSource('pub fnc selection(u8 a): u8 { return a; }'));
});
