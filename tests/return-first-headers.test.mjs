import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHardwareSource,emitSystemVerilog,evaluateReference,HardwareSourceError}
  from '../src/compiler.mjs';

const legacy='pub fnc add(u8 a,u8 b): u8 { return a+b; }';
const positive=[
  'pub fnc u8 <- add(u8 a,u8 b){return a+b;}',
  'pub u8 <- add(u8 a,u8 b){return a+b;}',
  'fnc u8 • add(u8 a,u8 b){return a+b;}',
  'u8 • add(u8 a,u8 b){return a+b;}',
  'pub fnc u8 • add(u8 a,u8 b){return a+b;}',
  'u8•add(u8 a,u8 b){return a+b;}',
  'pub fnc u8 <- add(u8 a,u8 b) begin return a+b; end',
  'u8 <- add(u8 a,u8 b) return a+b; end',
  'fnc u8 • add(u8 a,u8 b) return a+b; end',
  'pub u8 <- add(u8 a,u8 b) begin return a+b; end;',
  'fnc u8 • add(u8 a,u8 b) return a+b; end.',
  'pub fnc u8 <- add(u8 a,u8 b) begin return a+b; end.',
];
const original=parseHardwareSource(legacy);
const rtl=emitSystemVerilog(original);

test('canonical return-first arrows generate the same verified unsigned HDL AST and RTL',()=>{
  for(const source of positive){
    const program=parseHardwareSource(source);
    assert.equal(emitSystemVerilog(program),rtl,source);
    assert.deepEqual({...program},{...original},source);
    assert.ok(Object.isFrozen(program) && Object.isFrozen(program.params) &&
      Object.isFrozen(program.expression));
    assert.equal(evaluateReference(program,{a:12n,b:31n}),43n);
    assert.equal(evaluateReference(program,{a:255n,b:1n}),0n);
  }
});
test('invalid arrows, widths and mixed width expressions fail before emitting RTL',()=>{
  const negative=[
    ['pub u8 ← add(u8 a,u8 b){return a+b;}','HDL_TOKEN'],
    ['pub fnc u8 add(u8 a,u8 b){return a+b;}','HDL_SYNTAX'],
    ['pub u0 <- add(u8 a,u8 b){return a+b;}','HDL_SYNTAX'],
    ['pub u65 <- add(u8 a,u8 b){return a+b;}','HDL_WIDTH'],
    ['u8 <- add(u8 a,u16 b){return a+b;}','HDL_MISMATCH'],
    ['u8 <- add(u8 a,u8 b): u8 {return a+b;}','HDL_SYNTAX'],
    ['u8 <- add(){return a;}','HDL_UNBOUND'],
    ['u8 <- add(u8 a,u8 b){return a+b;} bogus','HDL_SYNTAX'],
    ['u8 <- add(u8 a,u8 b) return a+b; end..','HDL_SYNTAX'],
    ['u8 <- add(u8 a,u8 b) return a+b; end;;','HDL_SYNTAX'],
    ['u8 <- add(u8 a,u8 b){return a+b;}.','HDL_SYNTAX'],
  ];
  for(const [source,code] of negative){
    assert.throws(()=>parseHardwareSource(source),e=>
      e instanceof HardwareSourceError && e.code===code,source);
  }
});
test('bounded return-first infer proves the exact unsigned width and same emitted RTL',()=>{
  const reference=parseHardwareSource('pub fnc add(u8 a,u8 b): u8 {return a+b;}');
  const original=emitSystemVerilog(reference);
  for(const source of [
    'fnc infer <- add(u8 a,u8 b){return a+b;}',
    'infer • add(u8 a,u8 b){return a+b;}',
    'infer <- add(u8 a,u8 b) begin return a+b; end',
    'pub infer <- add(u8 a,u8 b) return a+b; end',
    'pub fnc infer • add(u8 a,u8 b){return a+b;}',
    'infer <- add(u8 a,u8 b) begin return a+b; end.',
    'pub fnc infer • add(u8 a,u8 b) return a+b; end;',
  ]){
    const actual=parseHardwareSource(source);
    assert.equal(actual.returnWidth,8,source);
    assert.deepEqual({...actual},{...reference},source);
    assert.equal(emitSystemVerilog(actual),original,source);
    assert.equal(evaluateReference(actual,{a:12n,b:31n}),43n,source);
  }
});
test('return-first infer rejects unbound, ambiguous and unsupported expressions',()=>{
  const negatives=[
    ['infer <- add(u8 a,u16 b){return a+b;}','HDL_MISMATCH'],
    ['infer <- add(u8 a,u8 b){return not_bound;}','HDL_UNBOUND'],
    ['infer <- add(){return a;}','HDL_UNBOUND'],
    ['infer <- add(u65 a,u65 b){return a+b;}','HDL_WIDTH'],
    ['infer <- add(u8 a,u8 b):u8{return a+b;}','HDL_SYNTAX'],
    ['infer <- add(u8 a,u8 b){return trap! a;}','HDL_EXCEPTION_BANG_UNSUPPORTED'],
  ];
  for(const [source,code] of negatives)
    assert.throws(()=>parseHardwareSource(source),
      e=>e instanceof HardwareSourceError&&e.code===code,source);
});

test('legacy syntax and existing bang-effect rejection are not weakened',()=>{
  assert.equal(evaluateReference(original,{a:12n,b:31n}),43n);
  const withComment=parseHardwareSource(
    'pub u8 <- add(u8 a,u8 b){return a+b;} // trailing comment');
  assert.equal(emitSystemVerilog(withComment),rtl);
  for(const keyword of ['trap!','throw!','raise!','panic!']){
    assert.throws(()=>parseHardwareSource(
      'u8 <- add(u8 a,u8 b){return '+keyword+' a;}'),
      e=>e instanceof HardwareSourceError && e.code==='HDL_EXCEPTION_BANG_UNSUPPORTED');
  }
});
