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
