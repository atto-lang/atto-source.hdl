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
