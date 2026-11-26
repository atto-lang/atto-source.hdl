import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource, parseHardwareSource, HardwareSourceError} from '../src/compiler.mjs';

test('durable actor declarations fail before RTL generation', () => {
  for (const prefix of ['define', 'define pub'])
    for (const kind of ['durable','persistent'])
      for (const gap of [' ', '\t', '\n', ' /* schema */ ']) {
        const source = prefix+' '+kind+gap+'actor Counter as state count: int = 0; end';
        for (const compile of [parseHardwareSource,compileSource])
          assert.throws(() => compile(source), e => e instanceof HardwareSourceError &&
            e.code==='HDL_DURABLE_ACTOR_UNSUPPORTED', source);
      }
});

test('ordinary scalar RTL and inert comments are not durable actor declarations', () => {
  const baseline=compileSource('fnc pass(u8 durable):u8{return durable;}').systemVerilog;
  assert.match(baseline,/module ores_pass/);
  for (const trivia of ['// define durable actor Counter\n', '/* define persistent actor Counter */\n'])
    assert.equal(compileSource(trivia+'fnc pass(u8 durable):u8{return durable;}').systemVerilog, baseline);
});
