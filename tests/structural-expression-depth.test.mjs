import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseHardwareSource, compileSource, emitSystemVerilog,
  evaluateReference, HardwareSourceError
} from '../src/compiler.mjs';

function chain(terms, operator='+') {
  const expr=Array.from({length:terms},(_,i)=>i%2===0?'a':'b').join(operator);
  return 'pub fnc fold(u8 a,u8 b): u8 { return '+expr+'; }';
}

test('bounded left-associated expressions remain executable in the reference and RTL',()=>{
  for(const operator of ['+','&','^','|']) {
    const source=chain(24,operator);
    const program=parseHardwareSource(source);
    assert.ok(Object.isFrozen(program.expression));
    const {systemVerilog}=compileSource(source);
    assert.match(systemVerilog,/assign out_result =/);
    assert.equal(emitSystemVerilog(program).includes('endmodule'),true);
    assert.equal(typeof evaluateReference(program,{a:1n,b:2n}),'bigint');
  }
});

test('long left-associated chains refuse before immutable admission or RTL emission',()=>{
  // 70 leaves produce a 70-level left spine despite zero parentheses.
  for(const operator of ['+','&','^','|']) {
    const source=chain(70,operator);
    for(const compile of [parseHardwareSource,compileSource]) {
      assert.throws(
        ()=>compile(source),
        e=>e instanceof HardwareSourceError && e.code==='HDL_DEPTH' &&
          /constructed expression AST depth limit/.test(e.message)
      );
    }
  }
});
