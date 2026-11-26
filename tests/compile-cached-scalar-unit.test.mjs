import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {compileSource} from '../src/compiler.mjs';
import {compileCachedScalarUnit,scalarCompilerClosureSha256} from '../src/compile-cached-scalar-unit.node.mjs';
import {makeLedgerRecord} from '../src/compiler-cache-envelope.node.mjs';
const source='pub fnc calc(u8 a,u8 b): u8 { return a+b; }',scope='tenant/unit',master=Buffer.alloc(32,7);
const ledgerRecord=makeLedgerRecord(scope,1n,master),ledgerPin=createHash('sha256').update(ledgerRecord).digest();
const config={source,owner:'example@1',unit:'main.atto',scope,master,ledgerRecord,ledgerPin,expectedCompilerSha256:scalarCompilerClosureSha256()};
const execute=async code=>{
 const dir=mkdtempSync(join(tmpdir(),'atto-hdl-api-'));try{
 const rtl=join(dir,'calc.sv'),tb=join(dir,'tb.sv'),out=join(dir,'sim');
 writeFileSync(rtl,code);writeFileSync(tb,'module tb; logic [7:0] a=41,b=1; wire [7:0] result; ores_calc dut(.in_a(a),.in_b(b),.out_result(result)); initial begin #1; $display("RTL_RESULT=%0d",result); $finish(0); end endmodule');
 execFileSync('iverilog',['-g2012','-s','tb','-o',out,rtl,tb]);const output=execFileSync('vvp',[out],{encoding:'utf8'});const matches=[...output.matchAll(/^RTL_RESULT=(\d+)$/gm)];assert.equal(matches.length,1,output);return BigInt(matches[0][1]);
 }finally{rmSync(dir,{recursive:true,force:true});}
};
test('actual compiler cold/warm persistent source-unit API and process restart',async()=>{
 const child=process.env.ATTO_CACHED_UNIT_CHILD;
 if(child){const hit=compileCachedScalarUnit({...config,root:child});assert.equal(hit.emitted,0);assert.equal(hit.reused,1);assert.equal(await execute(hit.code),42n);console.log('CACHED_SCALAR_CHILD_HIT');return;}
 const root=mkdtempSync(join(tmpdir(),'atto-cached-unit-'));
 try{
  const opts={...config,root};
  assert.throws(()=>compileCachedScalarUnit({...opts,cold:true,ledgerPin:Buffer.alloc(32)}),/E_CACHE_LEDGER/);
  const a=compileCachedScalarUnit(opts);assert.equal(a.emitted,1);assert.equal(a.code,compileSource(source).systemVerilog);assert.equal(await execute(a.code),42n);
  const b=compileCachedScalarUnit(opts);assert.equal(b.reused,1);assert.equal(a.code,b.code);
  const env={...process.env,ATTO_CACHED_UNIT_CHILD:root};delete env.NODE_TEST_CONTEXT;
  const p=spawnSync(process.execPath,['--test','--test-reporter=tap',new URL(import.meta.url).pathname],{env,encoding:'utf8',timeout:60000});
  assert.equal(p.status,0,p.stdout+p.stderr);assert.match(p.stdout,/CACHED_SCALAR_CHILD_HIT/);
  const edit=source.replace('a+b','a-b');const c=compileCachedScalarUnit({...opts,source:edit});assert.notEqual(c.key,a.key);assert.equal(c.emitted,1);assert.equal(c.code,compileSource(edit).systemVerilog);assert.equal(await execute(c.code),40n);
  const file=join(root,'slot-'+c.key[0]),before=readFileSync(file);
  assert.throws(()=>compileCachedScalarUnit({...opts,source:'pub fnc calc(u8 a,u8 b): u8 { return missing; }'}),/HDL_UNBOUND/);
  assert.deepEqual(readFileSync(file),before);console.log('CACHED_HDL_API|cold=42|warm-child=42|edit=40|rollback');
  assert.throws(()=>compileCachedScalarUnit({...opts,expectedCompilerSha256:'0'.repeat(64)}),/E_CACHE_COMPILER/);
  assert.throws(()=>compileCachedScalarUnit({...opts,source:source+'\ud800'}),/E_CACHE_INPUT/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
