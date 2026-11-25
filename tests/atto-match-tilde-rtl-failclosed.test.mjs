import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,evaluateReference,HardwareSourceError} from '../src/compiler.mjs';

test('unsupported match/aggregate tokens never produce SystemVerilog',()=>{
  const sources=[
    ['fnc f(u8 a):u8 { return match<u8> a over on 1 -> 2; default -> 42; end; }','HDL_MATCH_DEFAULT_UNSUPPORTED'],
    ['fnc f(u8 a):u8 { return match a over default -> 42; end; }','HDL_MATCH_DEFAULT_UNSUPPORTED'],
    ['fnc f(u8 a):u8 { return match a over on default -> 42; end; }','HDL_MATCH_DEFAULT_UNSUPPORTED'],
    ['fnc f(u8 a):u8 { return ~map<u8,u8>(1 => 2); }','HDL_TILDE_AGGREGATE_UNSUPPORTED'],
    ['fnc f(u8 a):u8 { return ~record(foo: 42); }','HDL_TILDE_AGGREGATE_UNSUPPORTED'],
    ['fnc f(u8 a):u8 { return ~(foo: a); }','HDL_TILDE_AGGREGATE_UNSUPPORTED'],
    ['fnc f(u8 a):u8 { return ~(); }','HDL_TILDE_AGGREGATE_UNSUPPORTED']
  ];
  for(const [source,code] of sources){
    assert.throws(()=>compileSource(source),err=>{
      assert.ok(err instanceof HardwareSourceError);
      assert.equal(err.code,code);
      assert.ok(Number.isInteger(err.offset));
      return true;
    },source);
  }
});
test('valid fixed-width arithmetic RTL ignores feature tokens inside comments',()=>{
  const src='pub fnc add8(u8 a,u8 b):u8 { /* match x over */ // ~map()\n return a+b; }';
  const {program,systemVerilog}=compileSource(src);
  assert.match(systemVerilog,/module ores_add8\(/);
  assert.match(systemVerilog,/assign out_result = \(in_a \+ in_b\)/);
  assert.equal(evaluateReference(program,{a:40n,b:2n}),42n);
});

test('nested inert match and aggregate trivia do not alter RTL',()=>{
  const clean='fnc pass(u8 a):u8 {return a;}';
  const commented='fnc pass(u8 a):u8 { /* outer /* match x */ ~record() */ return a;}';
  assert.equal(compileSource(commented).systemVerilog,compileSource(clean).systemVerilog);
});
