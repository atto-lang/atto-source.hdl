import test from 'node:test';
import assert from 'node:assert/strict';
import {lex,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';

const source = expression => 'pub fnc main(u8 item): u8 { return '+expression+'; }';

test('HDL never emits RTL for unsupported copy/take/borrow/share', () => {
  for (const expression of [
    'copy!item', 'take!item', 'borrow!item', 'borrow! item',
    'borrow!mut item', 'borrow! mut item', 'share!item',
  ]) {
    for (const compile of [lex,parseHardwareSource]) {
      assert.throws(() => compile(source(expression)),
        err => err instanceof HardwareSourceError &&
          err.code === 'HDL_OWNERSHIP_UNSUPPORTED',expression);
    }
  }
});

test('ownership-looking comments are inert, positive HDL unchanged', () => {
  const program=parseHardwareSource(
    'pub fnc main(u8 item): u8 { /* borrow! mut item */ return item; }');
  assert.equal(program.returnWidth,8);
  assert.doesNotThrow(() => lex(
    'pub fnc main(u8 item): u8 { // borrow! mut item\n return item; }'));
});

test('whitespace before bang is not the ownership operator', () => {
  assert.throws(() => parseHardwareSource(source('borrow !item')),
    err => err instanceof HardwareSourceError &&
      err.code !== 'HDL_OWNERSHIP_UNSUPPORTED');
});
