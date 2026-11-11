import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHardwareSource,compileSource,HardwareSourceError} from '../src/compiler.mjs';

test('RTL backend rejects actor subscriptions and channel operations, not pretending Flow parity',()=>{
  const source=[
    'pub async fnc f(u8 a):u8{return a;}',
    'fnc f(u8 a):u8 { return Flow.of(a).next(); }',
    'fnc f(u8 a):u8 { return readch a; }',
    'fnc f(u8 a):u8 { return await a; }',
    'fnc f(u8 a):u8 { return nb writech a, 1; }',
    'fnc f(u8 a):u8 { return a |> map; }',
    'fnc f(u8 a):u8 { return rt take a; }',
    'fnc f(u8 a):u8 { return Channel.new(a); }'
  ];
  for(const code of source)
    assert.throws(()=>parseHardwareSource(code),HardwareSourceError,code);
});

test('hardware-scoped fixed-width pure expression still compiles',()=>{
  const result=compileSource('pub fnc f(u8 a, u8 b):u8 { return a + b; }');
  assert.match(result.systemVerilog,/module ores_f/);
});
