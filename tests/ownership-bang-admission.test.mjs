import test from 'node:test';
import assert from 'node:assert/strict';
import {lex,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';

const source = expression => 'pub fnc main(u8 item): u8 { return '+expression+'; }';

test('HDL never emits RTL for unsupported copy/take/borrow/share', () => {
  for (const expression of [
    'copy!item', 'take!item', 'borrow!item', 'borrow! item',
    'borrow!mut item', 'borrow! mut item',
    'mut borrow!item', 'mut borrow! item', 'share!item',
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

test('nested block comments are inert and bounded before RTL emission', () => {
  const nested='pub fnc main(u8 item): u8 { /* outer /* borrow! mut item */ '+
    'inner tail /* copy!item */ */ return item; }';
  const parsed=parseHardwareSource(nested);
  assert.equal(parsed.returnWidth,8);
  assert.doesNotThrow(() => lex(nested));
  assert.throws(() => lex('/* outer /* borrow! item */'), err =>
    err instanceof HardwareSourceError && err.code === 'HDL_COMMENT');
  assert.throws(() => lex('/*'.repeat(65)+'*/'.repeat(65)), err =>
    err instanceof HardwareSourceError && err.code === 'HDL_COMMENT_LIMIT');
});
