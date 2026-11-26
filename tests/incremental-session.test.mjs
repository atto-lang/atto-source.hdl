import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,evaluateReference,IncrementalSession} from '../src/compiler.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const source='pub fnc calc(u8 a,u8 b): u8 { return a+b; }';
function simulate(code,expected){const dir=mkdtempSync(join(tmpdir(),'atto-hdl-incremental-'));try{
 const rtl=join(dir,'calc.sv'),tb=join(dir,'tb.sv'),out=join(dir,'sim');writeFileSync(rtl,code);
 writeFileSync(tb,"module tb; logic [7:0] a=8'd41,b=8'd1; wire [7:0] result; ores_calc dut(.in_a(a),.in_b(b),.out_result(result)); initial begin #1; if(result !== 8'd"+expected+") $fatal(1); $display(\"RTL_OK\"); $finish; end endmodule");
 execFileSync('iverilog',['-g2012','-s','tb','-o',out,rtl,tb]);assert.match(execFileSync('vvp',[out],{encoding:'utf8'}),/RTL_OK/);
 }finally{rmSync(dir,{recursive:true,force:true});}}
test('actual RTL cold/warm/edit and immutable AST',()=>{const s=new IncrementalSession();const a=s.build(source,{cold:true});assert.equal(a.reused,false);assert.equal(a.systemVerilog,compileSource(source).systemVerilog);simulate(a.systemVerilog,42);
 const b=s.build(source);assert.equal(b.reused,true);assert.equal(b.systemVerilog,a.systemVerilog);simulate(b.systemVerilog,42);assert.throws(()=>{b.program.params[0].width=32;},TypeError);b.systemVerilog='forged';assert.equal(s.build(source).systemVerilog,a.systemVerilog);
 const edit=source.replace('a+b','a-b');const c=s.build(edit);assert.equal(c.reused,false);assert.equal(c.systemVerilog,compileSource(edit).systemVerilog);simulate(c.systemVerilog,40);assert.equal(evaluateReference(c.program,{a:41n,b:1n}),40n);
 assert.throws(()=>s.build(edit.replace('a-b','missing')),e=>e.code==='HDL_UNBOUND');assert.equal(s.build(edit).reused,true);console.log('INCREMENTAL_HDL|actual-rtl=42/40|immutable|rollback');});
