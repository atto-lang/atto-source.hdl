import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {compileNamespaceProvider,evaluateReference,compileSource} from '../src/compiler.mjs';
const provider=value=>'namespace billing;\npub fnc value(): int { return '+value+'; }\n';
test('literal namespace providers use actual immutable unsigned RTL',()=>{
 for(const value of ['0','42','9223372036854775807']){
  const {program,systemVerilog}=compileNamespaceProvider(provider(value),'billing','value');
  assert.equal(evaluateReference(program,{}),BigInt(value));
  assert.equal(systemVerilog,compileSource('pub fnc value(): u64 { return '+value+'; }').systemVerilog);
  const dir=mkdtempSync(join(tmpdir(),'atto-hdl-provider-'));
  try{
   const rtl=join(dir,'guest.sv'),tb=join(dir,'tb.sv'),sim=join(dir,'sim');
   writeFileSync(rtl,systemVerilog);
   writeFileSync(tb,"module tb; wire [63:0] result; ores_value dut(.out_result(result)); initial begin #1; if(result !== 64'd"+value+") $fatal(1); $finish; end endmodule");
   execFileSync('iverilog',['-g2012','-s','tb','-o',sim,rtl,tb]);
   execFileSync('vvp',[sim]);
  }finally{rmSync(dir,{recursive:true,force:true});}
 }
});
test('provider admission rejects mismatched identity, arity and range',()=>{
 for(const value of ['-1','01','9223372036854775808','41+1'])assert.throws(()=>compileNamespaceProvider(provider(value),'billing','value'),e=>e.code==='E_NAMESPACE_LITERAL');
 assert.throws(()=>compileNamespaceProvider(provider('42'),'other','value'),e=>e.code==='E_NAMESPACE_PROFILE');
 assert.throws(()=>compileNamespaceProvider(provider('42').replace('()','(int x)'),'billing','value'),e=>e.code==='E_NAMESPACE_ARITY');
});
