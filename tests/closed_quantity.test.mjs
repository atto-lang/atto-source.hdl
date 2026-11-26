import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,evaluateReference,emitSystemVerilog,parseHardwareSource} from '../src/compiler.mjs';
const pre='define dimension Time; define dimension Length; define unit Second: Time; define unit Millis: Time = Second / 1000; define unit Meter: Length;';
const source=e=>pre+' pub fnc main() -> int { return '+e+'; }';
test('closed quantities are immutable parser-admitted signed RTL constants',()=>{
 for(const expr of ['84_000<Millis>.to_unit<Second>()/2<Second>','(21.<Meter>*2.<Second>)/(1.<Second>*1.<Meter>)','(84 as Second)/(2 as Second)']){
  const {program,systemVerilog}=compileSource(source(expr));
  assert.equal(evaluateReference(program,{}),42n);
  assert.match(systemVerilog,/output logic signed \[63:0\]/);
  assert.match(systemVerilog,/64'sh000000000000002a/);
  assert.throws(()=>emitSystemVerilog({...program}),e=>e.code==='HDL_UNVERIFIED_AST');
 }
 const p=compileSource(source('-9223372036854775808<Second>/1<Second>'));
 assert.equal(evaluateReference(p.program,{}),-(1n<<63n));
 assert.match(p.systemVerilog,/64'sh8000000000000000/);
});
test('reject static denials and known traps before RTL emission',()=>{
 for(const [e,code,detail] of [
  ['1<Second>+1<Meter>','E_UNIT_DIMENSION'],['1<Second>/1<Millis>','E_UNIT_ERASURE'],
  ['1_500<Millis>.to_unit<Second>()/1<Second>','E_UNIT_INEXACT'],
  ['9223372036854775807<Second>.to_unit<Millis>()/1<Millis>','E_UNIT_RANGE'],
  ['1<Second>/0<Second>','HDL_STATIC_ARITHMETIC','divisionByZero'],
  ['-9223372036854775808<Second>/-1<Second>','HDL_STATIC_ARITHMETIC','integerOverflow'],
  ['(9223372036854775807<Second>+1<Second>)/1<Second>','HDL_STATIC_ARITHMETIC','integerOverflow'],
  ['42<Second>.<Second>','E_UNIT_ATTACHMENT'],
  ['42 <Second>/1<Second>','HDL_QUANTITY_SYNTAX'],
  ['42.<Time>','E_UNIT_NAME'],
  ['1<Second>/0<Second>+1<Meter>','E_UNIT_DIMENSION'],
 ]){
  assert.throws(()=>compileSource(source(e)),x=>x.code===code&&(!detail||x.message.includes(detail)),e);
 }
 assert.throws(()=>parseHardwareSource(source('42')+' trailing'));
 assert.throws(()=>parseHardwareSource(source('42')+'\u202e'),x=>x.code==='HDL_BIDI_CONTROL');
 assert.throws(()=>compileSource(source('1+'.repeat(70)+'1')),x=>x.code==='HDL_DEPTH');
});


test('closed main body delimiters preserve identical signed RTL and checked casts',()=>{
 const header=pre+' pub fnc main() -> int';
 const baseline=compileSource(header+' { return 42::<i64>; }').systemVerilog;
 for(const body of ['\nbegin return 42::<i64>; end',' :: return 42::<i64>; end','\n:: return 42::<i64>; end']){
  const got=compileSource(header+body);
  assert.equal(got.systemVerilog,baseline);
  assert.equal(evaluateReference(got.program,{}),42n);
 }
 for(const body of [' :: return 42; }',' :: return 42;',' :: begin return 42; end',' { return 42; end'])
  assert.throws(()=>compileSource(header+body),e=>e.code==='HDL_QUANTITY_SYNTAX');
 assert.throws(()=>compileSource(header+' requires 1 > 0 :: return 42; end'),e=>e.code==='HDL_QUANTITY_PROFILE');
 assert.throws(()=>compileSource(pre+' fnc f(int x) -> int requires x > 0 :: return x; end pub fnc main() -> int { return f(42); }'),e=>e.code==='HDL_QUANTITY_PROFILE');
});


test('closed annotated division helper proves all admitted inputs before RTL',()=>{
 const header='@requires(x >= 1)\n@ensures(result <= 84)\nfnc f(int x) -> int requires x <= 42';
 const tail=' pub fnc main() -> int { return f(2); }';
 const baseline=compileSource(source('42')).systemVerilog;
 for(const body of [' { return 84/x; }','\nbegin return 84/x; end',' :: return 84/x; end','\n:: return 84/x; end']){
  const p=compileSource(pre+header+body+tail);
  assert.equal(p.systemVerilog,baseline);
  assert.equal(evaluateReference(p.program,{}),42n);
  assert.throws(()=>compileSource(pre+header+body+tail.replace('f(2)','f(0)')),e=>e.code==='E_REFINEMENT_PRECONDITION');
 }
 const dual='@requires(x != 0)\nfnc f(int x) -> int requires x != -1 :: return -9223372036854775808/x; end';
 assert.equal(evaluateReference(compileSource(pre+dual+tail).program,{}),-4611686018427387904n);
 assert.throws(()=>compileSource(pre+dual+tail.replace('f(2)','f(-1)')),e=>e.code==='E_REFINEMENT_PRECONDITION');
 assert.throws(()=>compileSource(pre+dual.replace('requires x != -1','')+tail),e=>e.code==='E_VERIFY_UNPROVEN');
 assert.throws(()=>compileSource(pre+dual.replace('requires x != -1','requires x eq 0')+tail),e=>e.code==='E_REFINEMENT_EMPTY');
 assert.throws(()=>compileSource(pre+header.replace('result <= 84','result <= 1')+' :: return 84/x; end'+tail),e=>e.code==='E_REFINEMENT_POSTCONDITION');
 assert.throws(()=>compileSource(pre+header+' begin return 84/x; end'+tail),e=>e.code==='HDL_QUANTITY_SYNTAX');
 assert.throws(()=>compileSource(pre+header+' :: return 84/x; }'+tail),e=>e.code==='HDL_QUANTITY_SYNTAX');
 assert.throws(()=>compileSource(pre+header.replace('@requires(x >= 1)','@requires(x >= 1 && x <= 42)')+' :: return 84/x; end'+tail));
 assert.throws(()=>compileSource(pre+'@requires(x >= 1) fnc f(int x) -> int :: return 84/x; end pub fnc main() -> int { return f(2); } trailing'));
});
