import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,parseHardwareSource} from '../src/compiler.mjs';

// HDL cannot host the dynamic allocator, scheduler, OS adapters or even the
// general compiler-owned Core module linker. These are negative *compiler*
// checks, not evidence that Core/Alloc/Std are executable in RTL.
test('canonical Atto library imports fail before RTL publication', () => {
  for(const moduleName of [
    'atto.core/numeric', 'atto.core/numeric.atto',
    'atto.alloc/byte_region', 'atto.std/fs', 'atto.runtime.actor',
    'ores.core/numeric', 'ores.std/core',
    './atto.core/numeric.atto', '../atto.std/fs.atto'
  ]) {
    const source='import module lib from "'+moduleName+'";\n'
      +'pub fnc pass(u8 a): u8 { return a; }';
    for(const compile of [parseHardwareSource,compileSource])
      assert.throws(()=>compile(source), error =>
        error.code==='HDL_LIBRARY_PROFILE_UNSUPPORTED',
        'module '+moduleName+' must be denied before hardware output');
  }
});

test('comment-lookalike library imports cannot trigger the policy', () => {
  const input='// import module a from "atto.std/fs";\n'
    +'/* import module b from "atto.alloc/byte_region"; */\n'
    +'pub fnc pass(u8 a): u8 { return a; }';
  const {systemVerilog}=compileSource(input);
  assert.match(systemVerilog,/module ores_pass\(/);
});

test('source-local unsupported import statement also fails with explicit profile diagnostic',()=>{
  const source='import module user from "./other.atto";\n'
    +'pub fnc pass(u8 a): u8 { return a; }';
  assert.throws(()=>compileSource(source),error=>error.code==='HDL_LIBRARY_PROFILE_UNSUPPORTED');
});
