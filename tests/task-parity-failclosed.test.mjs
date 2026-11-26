import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';

const hdl='pub fnc add(u8 a, u8 b): u8 { return a+b; }';
const inFn=statement=>'pub fnc add(u8 a, u8 b): u8 { '+statement+' }';
const rejects=(source,code)=>assert.throws(
  ()=>compileSource(source),
  e=>e instanceof HardwareSourceError && e.code===code,
  source);

test('HDL task lowering fails closed: never convert sync into spawn, join or RTL',()=>{
  for(const statement of [
    'return sync task { return a; };',
    'return sync task { return a + b; };',
    'do sync task {};',
    'do sync task<void> {};',
    'return await task { return a; };'
  ]){
    // Reject task prefixes before generic punctuation obscures their diagnostic.
    rejects(inFn(statement),'HDL_TASK_UNSUPPORTED');
  }
  rejects('pub fnc sync(u8 a, u8 b): u8 { return a+b; }','HDL_TASK_UNSUPPORTED');
  rejects(inFn('return await a;'),'HDL_TASK_UNSUPPORTED');
  rejects(inFn('return task { a + b };'),'HDL_EXECUTION_DOMAIN');
});

test('token-level admission ignores task words in comments and longer names',()=>{
  const valid='// do sync task<void> { }\n'
    +'pub fnc add_sync(u8 task_count, u8 b): u8 {'
    +'/* await task<int> {return 1;} */ return task_count+b; }';
  const {systemVerilog}=compileSource(valid);
  assert.match(systemVerilog,/module ores_add_sync\(/);
  assert.match(systemVerilog,/assign out_result = \(in_task_count \+ in_b\)/);
  const p=parseHardwareSource(hdl);
  assert.equal(p.returnWidth,8);
});

test('actual CLI rejects task source without generating any RTL artifact',()=>{
  const folder=mkdtempSync(join(tmpdir(),'atto-hdl-task-denial-'));
  try{
    const source=join(folder,'task.atto'),output=join(folder,'task.sv');
    const cli=fileURLToPath(new URL('../bin/oreslang-hdl.mjs',import.meta.url));
    for(const [body,diagnostic] of [
      [inFn('do sync task {}; return a+b;'),'HDL_TASK_UNSUPPORTED'],
      [inFn('return sync task<int> { return a; };'),'HDL_TASK_UNSUPPORTED']
    ]){
      writeFileSync(source,body);
      const result=spawnSync(process.execPath,[cli,source,output],
        {encoding:'utf8',timeout:30000});
      assert.equal(result.status,1,result.stderr);
      assert.match(result.stderr,new RegExp(diagnostic));
      assert.equal(existsSync(output),false);
    }
    writeFileSync(source,hdl);
    const success=spawnSync(process.execPath,[cli,source,output],
      {encoding:'utf8',timeout:30000});
    assert.equal(success.status,0,success.stderr);
    assert.match(readFileSync(output,'utf8'),/module ores_add\(/);
  }finally{rmSync(folder,{recursive:true,force:true});}
});

// Identical source from the public shared corpus; reject task semantics, not merely '='.
test('branch writeback guests reject with task-specific diagnostic before any RTL',()=>{
  const fixtures=[["inline-shortcircuit-writeback","adea3e544fd92d4b79387f7dc9881e36ecae65f3"],["inline-conditional-writeback","84c0e81f83361e00be1f3441fc4171546654609f"],["inline-match-writeback","2a85a1d585bb8b3ff98afcea5d0f201c911c8de3"],["inline-ternary-writeback","3c756a785b22eea6b3d076f1c506c642dce4a839"]];
  const folder=mkdtempSync(join(tmpdir(),'atto-hdl-branch-task-'));
  try{
    const output=join(folder,'task.sv');
    const cli=fileURLToPath(new URL('../bin/oreslang-hdl.mjs',import.meta.url));
    for(const [name,blob] of fixtures){
      const source=fileURLToPath(new URL('./fixtures/inline-task-writeback-v1/'+name+'.atto',import.meta.url));
      const bytes=readFileSync(source);
      assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),blob);
      rejects(bytes.toString('utf8'),'HDL_TASK_UNSUPPORTED');
      const result=spawnSync(process.execPath,[cli,source,output],{encoding:'utf8',timeout:30000});
      assert.equal(result.status,1,result.stderr);
      assert.match(result.stderr,/^HDL_TASK_UNSUPPORTED at offset /);
      assert.equal(existsSync(output),false);
      assert.deepEqual(readFileSync(source),bytes);
    }
  }finally{rmSync(folder,{recursive:true,force:true});}
});

test('task header preflight preserves trivia and does not reinterpret literals',()=>{
  rejects(inFn('let int x = a; return sync /* nested /* ok */ comment */ task<int> { return a; };'),'HDL_TASK_UNSUPPORTED');
  rejects(inFn('let int x = a; return sync // comment\n task<int> { return a; };'),'HDL_TASK_UNSUPPORTED');
  for(const statement of ['let int x = a; return sync_task;', 'let int x = a; return sync + task;', 'let int x = a; return "sync task";', 'let int x = a; /* sync task */ return a;']){
    assert.throws(()=>compileSource(inFn(statement)),e=>e instanceof HardwareSourceError && e.code==='HDL_TOKEN');
  }
});
