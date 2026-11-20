import test from 'node:test';
import assert from 'node:assert/strict';
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
    // Typed generics are not part of the HDL lexer; those fail earlier at
    // HDL_TOKEN. The no-generic forms get a dedicated task diagnostic.
    rejects(inFn(statement),statement.includes('<')?'HDL_TOKEN':'HDL_TASK_UNSUPPORTED');
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
      [inFn('return sync task<int> { return a; };'),'HDL_TOKEN']
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
