import test from 'node:test';
import assert from 'node:assert/strict';
import {compileStrictSource,evaluateReference,compileSource} from '../src/compiler.mjs';
const pre='define dimension Time; define unit Second: Time; type Bounded = int where self >= 1 and self <= 42;';
const src=e=>pre+' pub fnc main() -> int { return '+e+'; }';
test('strict closed signed scalar RTL retains real values and proof fences',()=>{
 for(const [e,want] of [['84 / 2',42n],['42 as Bounded',42n],['-9223372036854775808',-(1n<<63n)]]){
  const p=compileStrictSource(src(e));assert.equal(evaluateReference(p.program,{}),want);assert.match(p.systemVerilog,/output logic signed \[63:0\]/);
 }
 for(const e of ['42/0','-9223372036854775808/-1','9223372036854775807+1','43 as Bounded','(9223372036854775807+1)*0'])
  assert.throws(()=>compileStrictSource(src(e)),e=>e.code==='E_VERIFY_UNPROVEN');
 for(const s of ['pub fnc main() -> int { return 42; }',pre+' fnc f(int x) -> int { return x+1; } pub fnc main() -> int { return f(1); }',pre+' pub fnc main() -> int { let int x=1; return x; }',src('42')+' trailing'])
  assert.throws(()=>compileStrictSource(s),e=>e.code==='E_VERIFY_UNSUPPORTED');
 assert.equal(evaluateReference(compileSource('pub fnc main() -> int { return 42; }').program,{}),42n);
});

test('strict immutable lexical captures are eager, independent and bounded',()=>{
 const s=body=>pre+' pub fnc main() -> int { '+body+' }';
 for(const [body,want] of [
 ['val int a=40; val b=a+2; return b;',42n],
 ['val a: Bounded=42; val b=a; return b;',42n],
 ['val int a=0; return a+42;',42n]
 ])assert.equal(evaluateReference(compileStrictSource(s(body)).program,{}),want);
 for(const [body,code] of [
 ['val int a; return 42;','E_MISSING_INITIALIZER'],
 ['val int a=1/0; return 42;','E_VERIFY_UNPROVEN'],
 ['val Bounded a=43; return 42;','E_VERIFY_UNPROVEN'],
 ['val a=42; val a=1; return a;','E_VERIFY_UNSUPPORTED']
 ])assert.throws(()=>compileStrictSource(s(body)),e=>e.code===code);
});

test('fixed immutable arrays retain eager receiver-specific values',()=>{
 const s=b=>pre+' pub fnc main() -> int { '+b+' }';
 for(const b of [
  'val a=Array.of(7,42); val i=1; return a[i];',
  'val a=Array.of(40); val b=Array.of(2,9); return a[0]+b[0];',
  'val a=Array.of(42,7); val b=a[0]; return b;'
 ])assert.equal(evaluateReference(compileStrictSource(s(b)).program,{}),42n);
 for(const [b,code] of [
  ['val a=Array.of(42); return a[1];','E_VERIFY_UNPROVEN'],
  ['val a=Array.of(42); return a[-1];','E_VERIFY_UNPROVEN'],
  ['val a=Array.of(42,1/0); return a[0];','E_VERIFY_UNPROVEN'],
  ['val a=Array.of(42); val b=Array.of(1,2); return a[1];','E_VERIFY_UNPROVEN'],
  ['val a=Array.of(42); return a;','E_VERIFY_UNSUPPORTED'],
  ['val a=Array.of(42); val b=a; return 42;','E_VERIFY_UNSUPPORTED'],
  ['val a=Array.of(42); a[0]=0; return 42;','E_VERIFY_UNSUPPORTED'],
  ['val a=Array.of('+Array(17).fill('1').join(',')+'); return 42;','HDL_EXPR_LIMIT']
 ])assert.throws(()=>compileStrictSource(s(b)),e=>e.code===code);
});
