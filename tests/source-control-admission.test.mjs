import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lex} from '../src/compiler.mjs';

test('ESC/DEL in comments and source text fail before RTL generation', () => {
  for (const control of ['\x1b', '\x7f']) {
    for (const source of [
      'fnc foo() { /*' + control + '*/ }',
      'fnc foo() {} //' + control,
      'fnc foo() { ' + control + ' }',
    ]) {
      assert.throws(
        () => lex(source),
        error => error?.code === 'HDL_SOURCE_CONTROL'
          && error.offset === source.indexOf(control),
      );
    }
  }
});

test('ordinary source spacing remains lexable', () => {
  assert.doesNotThrow(() => lex('fnc foo() {\r\n\t }'));
});
