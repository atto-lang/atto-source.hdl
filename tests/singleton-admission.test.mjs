import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';

test('RTL frontend rejects singleton declarations before emission',()=>{
  for(const src of [
    'define singleton S as end',
    'define pub singleton S as end',
    'pub define singleton S as end',
    'define /* inert */ singleton S as end',
    'define module M as define singleton S as end end',
    'fnc add(u8 x): u8 { return x; } define singleton S as end',
  ]) {
    for(const compile of [parseHardwareSource,compileSource]) {
      assert.throws(()=>compile(src),e=>e instanceof HardwareSourceError &&
        e.code==='HDL_SINGLETON_UNSUPPORTED' && /ORES-SINGLETON-UNSUPPORTED/.test(e.message),src);
    }
  }
});

test('singleton is contextual; comment text and names remain ordinary RTL identifiers',()=>{
  for(const src of [
    'fnc singleton(u8 a): u8 { return a; }',
    'fnc f(u8 singleton): u8 { return singleton; }',
    '// define singleton Fake as end\nfnc f(u8 a): u8 { return a; }',
    '/* define pub singleton Fake as end */ fnc f(u8 a): u8 { return a; }',
    'fnc singleton_factory(u8 a): u8 { return a; }',
  ]) assert.doesNotThrow(()=>compileSource(src),src);
});
