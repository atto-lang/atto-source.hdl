import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource, HardwareSourceError} from '../src/compiler.mjs';

const safe = 'fnc f(u8 a): u8 { return a; }';
const bidiControls = [0x061c, 0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069];

test('HDL source refuses Trojan Source bidi controls before tokenization', () => {
  for (const cp of bidiControls) {
    const control = String.fromCodePoint(cp);
    for (const source of [safe + '// ' + control, '/* ' + control + ' */ ' + safe]) {
      assert.throws(() => compileSource(source), error =>
        error instanceof HardwareSourceError && error.code === 'HDL_BIDI_CONTROL',
        'U+' + cp.toString(16));
    }
  }
});

test('ordinary non-ASCII comments are not rejected', () => {
  assert.doesNotThrow(() => compileSource(safe + ' // café'));
});
