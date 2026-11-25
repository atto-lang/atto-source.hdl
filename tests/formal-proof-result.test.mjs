import test from 'node:test';
import assert from 'node:assert/strict';
import {requireYosysSatResult} from '../src/formal-proof-result.mjs';

const passed='SAT proof finished - no model found: SUCCESS!';
const cex='SAT proof finished - model found: FAIL!';
const run=(stdout,{status=0,stderr='',signal=null,error=undefined}={})=>
  ({stdout,stderr,status,signal,error});

test('accept exactly one successful proof with clean Yosys completion',()=>{
  assert.equal(requireYosysSatResult(run('Solving...\n'+passed),true),true);
});
test('accept exactly one counterexample in -falsify mode with clean Yosys completion',()=>{
  assert.equal(requireYosysSatResult(run('Solving...\n'+cex),false),true);
});
test('reject misleading, missing and duplicated proof messages',()=>{
  const invalid=[
    ['missing proof',true],['WARNING: sat command not found',false],
    [cex,true],[passed,false],[passed+'\n'+cex,true],
    [cex+'\n'+passed,false],[passed+'\n'+passed,true],
    [cex+'\n'+cex,false],
    ['SAT proof finished - no model found: SUCCESS!\n'+cex,false]
  ];
  for(const [log,expect] of invalid)
    assert.throws(()=>requireYosysSatResult(run(log),expect),/proof witness/);
});
test('never confuse process errors and timeouts with formal counterexamples',()=>{
  for(const overrides of [
    {status:1},{status:null,signal:'SIGTERM'},
    {status:null,error:new Error('ENOENT')},
    {status:137},{status:null,signal:'SIGKILL'}
  ])for(const equivalent of [false,true])
    assert.throws(()=>requireYosysSatResult(run(equivalent?passed:cex,overrides),equivalent),
      /did not complete cleanly/);
});
