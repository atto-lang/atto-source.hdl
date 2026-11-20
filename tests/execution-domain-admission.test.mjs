import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHardwareSource} from '../src/compiler.mjs';

const rejectsAsDomain = source => assert.throws(
  () => parseHardwareSource(source),
  error => error.code === 'HDL_EXECUTION_DOMAIN',
  source);

for (const word of ['cpu', 'gpu', 'quantum']) {
  test(`${word} is reserved in every source position`, () => {
    rejectsAsDomain(`pub fnc ${word}(u8 a, u8 b): u8 { return a + b; }`);
    rejectsAsDomain(`pub fnc add8(u8 ${word}, u8 b): u8 { return ${word} + b; }`);
    rejectsAsDomain(`pub fnc add8(u8 a, u8 b): u8 { return ${word} { a + b }; }`);
    rejectsAsDomain(`pub ${word} fnc add8(u8 a, u8 b): u8 { return a + b; }`);
    rejectsAsDomain(`pub fnc add8(u8 a, u8 b): u8 { return ${word} task { a + b }; }`);
  });
}

test('task and nb blocks are rejected as execution tasks', () => {
  rejectsAsDomain('pub fnc add8(u8 a, u8 b): u8 { return task { a + b }; }');
  rejectsAsDomain('pub fnc add8(u8 a, u8 b): u8 { return nb { a + b }; }');
});

test('comments and longer names containing domain words stay ordinary', () => {
  assert.doesNotThrow(() => parseHardwareSource(
    '// gpu { cpu { quantum } } task { }\n'
    + 'pub fnc add_gpu(u8 cpu_count, u8 b): u8 { /* nb { } */ return cpu_count + b; }'));
});
