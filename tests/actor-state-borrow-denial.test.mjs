import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource, parseHardwareSource, HardwareSourceError} from '../src/compiler.mjs';

// RTL has no actor scheduler, typed state loan CFG, or mutable aliasing
// analysis. Unsupported Atto actor syntax MUST fail before SystemVerilog.
const denied = [
  'define actor Meter as let int counter = 0; end',
  'fnc f(u8 a): u8 { this.handle_state(critical-write |s| -> { s.counter = a; }); return a; }',
  'fnc f(u8 a): u8 { critical-read |s| -> { s.counter; }; return a; }',
  'fnc f(u8 a): u8 { return a + borrow! mut a; }',
  'fnc f(u8 a): u8 { return actor.state.counter; }'
];
test('HDL never publishes RTL from source actor-state borrow operations', () => {
  for (const source of denied) {
    assert.throws(() => parseHardwareSource(source),
      e => e instanceof HardwareSourceError && /^HDL_/.test(e.code), source);
    assert.throws(() => compileSource(source),
      e => e instanceof HardwareSourceError && /^HDL_/.test(e.code), source);
  }
});
test('HDL lexical denial does not reject inert comments about actor borrows', () => {
  const source='fnc f(u8 a): u8 { /* handle_state critical-write borrow! */ return a; }';
  const out=compileSource(source);
  assert.match(out.systemVerilog, /module /);
});

test('canonical return-first source cannot bypass the ownership gate',()=>{
  const input='u8 <- f(u8 a){return borrow! mut a;}';
  assert.throws(()=>compileSource(input), e=>e?.code==='HDL_OWNERSHIP_UNSUPPORTED');
});
