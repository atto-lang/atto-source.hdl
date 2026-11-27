import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource, lex, parseHardwareSource, HardwareSourceError} from '../src/compiler.mjs';

const check = (expr, code, marker) => {
  const source = 'fnc f(u8 n):u8 { return ' + expr + '; }';
  for (const compile of [lex, parseHardwareSource, compileSource])
    assert.throws(() => compile(source), e => e instanceof HardwareSourceError &&
      e.code === code && e.offset === source.indexOf(marker), expr);
};

test('grouped and legacy actor spawn cannot emit combinational RTL', () => {
  for (const expr of [
    'spawn Worker()',
    'spawn Worker() with {}',
    'spawn Worker() with { schedule { max_parallelism = 2; affinity = sticky; } }',
    'spawn Worker() with { resources { heap_size = 64 * 1024 * 1024; stack_size = 65536; mailbox_capacity = 1024; } }',
    'spawn Worker() with { init { seed = 42; } }',
    'spawn Worker() with { init {} init {} }',
    'spawn Worker() with { unknown {} }',
    'spawn Worker() /* grouped options */ with { init {} }',
    'spawn Worker() with schedule(max_parallelism = 1)'
  ]) check(expr, 'HDL_ACTOR_UNSUPPORTED', 'spawn');
  check('await spawn Worker() with { init {} }', 'HDL_TASK_UNSUPPORTED', 'await');
});

test('inert grouped spawn comments and longer identifiers preserve RTL', () => {
  const source = 'fnc f(u8 spawn_count, u8 with_value):u8 { return spawn_count + with_value; }';
  const baseline = compileSource(source).systemVerilog;
  for (const prefix of [
    '// spawn Worker() with { init {} }\n',
    '/* spawn Worker() with { schedule { max_parallelism = 2; } } */ ',
    '/* outer /* spawn Worker() with {} */ inner */ '
  ]) assert.equal(compileSource(prefix + source).systemVerilog, baseline);
  assert.match(baseline, /module ores_f\(/);
});
