import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHardwareSource} from '../src/compiler.mjs';

for (const source of [
  'define singleton Counter as const u8 count = 0; end',
  'define pub singleton Counter as const u8 count = 0; end',
  'pub define singleton Counter as const u8 count = 0; end',
]) {
  test('HDL rejects singleton before any RTL output: '+source.split(' ').slice(0,3).join(' '), () => {
    assert.throws(()=>parseHardwareSource(source),
      error=>error.code==='HDL_SINGLETON_UNSUPPORTED',source);
  });
}
test('inert comments cannot invent a singleton declaration',()=>{
  assert.doesNotThrow(()=>parseHardwareSource(
    '// define singleton Counter as\npub fnc add8(u8 a, u8 b): u8 { return a + b; }'));
  assert.doesNotThrow(()=>parseHardwareSource(
    '/* define singleton Counter as */ pub fnc add8(u8 a, u8 b): u8 { return a + b; }'));
});
test('singleton is contextual; longer identifiers do not affect HDL expressions',()=>{
  assert.doesNotThrow(()=>parseHardwareSource(
    'pub fnc singleton(u8 count, u8 b): u8 { return count + b; }'));
  assert.doesNotThrow(()=>parseHardwareSource(
    'pub fnc add8(u8 singleton_count, u8 b): u8 { return singleton_count + b; }'));
});
