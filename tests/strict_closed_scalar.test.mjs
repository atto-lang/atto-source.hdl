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

// Neither profile implements nominal methods. Reject the complete source
// rather than discarding declarations and emitting the scalar entry alone.
// This is an unsupported-profile check, not language grammar certification.
test('nominal methods cannot fall through to scalar RTL emission',()=>{
 for(const kind of ['class','actor','struct','interface','trait']){
  for(const prefix of ['', 'mtd ', 'fnc ', 'method ']){
   const member=prefix+'ping(): int'+(['interface','trait'].includes(kind)?';':' { return 42; }');
   const ordinary='define '+kind+' C as '+member+' end pub fnc main() -> int { return 42; }';
   const strict=pre+' '+ordinary;
   assert.throws(()=>compileSource(ordinary),e=>typeof e.code==='string' && e.code.startsWith('HDL_'),ordinary);
   assert.throws(()=>compileStrictSource(strict),e=>typeof e.code==='string' && (e.code.startsWith('HDL_') || e.code.startsWith('E_VERIFY_')),strict);
  }
 }
 // Ordinary callable names do not become nominal declaration markers.
 for(const name of ['method','mtd']){
  const p=compileSource('pub fnc '+name+'() -> u8 { return 42; }');
  assert.equal(evaluateReference(p.program,{}),42n);
 }
});
