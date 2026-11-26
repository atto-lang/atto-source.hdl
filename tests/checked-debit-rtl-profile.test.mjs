// Adapt the canonical checked-debit rows to the explicit signed RTL ABI.
 // This is not general function-call lowering or the software actor panic ABI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {compileCheckedNamespaceProvider,evaluateReference,compileSource} from '../src/compiler.mjs';
const bytes=readFileSync(new URL('../contracts/atto-xo-checked-debit-v1/cases.tsv',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'e6e3394d5d62ec1f8171053b74a3b68389c41d5c797d81c14f561d1ca097a28b');
const rows=bytes.toString('utf8').trimEnd().split('\n').map(r=>r.split('|'));
assert.deepEqual(rows.map(r=>[r[0],r[1]]),[
 ['normal','42'],['control','43'],['max-valid','42'],['fee-overflow','overflow'],
 ['notional-overflow','overflow'],['overflow-cancel','overflow'],['overflow-dead-result','overflow']
]);
for(const r of rows)assert.equal(r.length,8);
const hex=v=>"64'sh"+BigInt.asUintN(64,v).toString(16).padStart(16,'0');
test('unchanged interprocedural corpus is not admitted by the ordinary HDL compiler',()=>{
 for(const r of rows)assert.throws(()=>compileSource(r[7]),r[0]);
});
for(const operator of ['+','-','*']){
 test('checked debit RTL dynamic input projection '+operator,()=>{
  const source='namespace billing;\npub fnc debit(int price, int shares, int fee, int rhs): int { return (price * shares + fee) '+operator+' rhs; }\n';
  const {program,systemVerilog}=compileCheckedNamespaceProvider(source,'billing','debit',4);
  const cases=rows.filter(r=>r[5]===operator);assert.ok(cases.length);
  const vectors=[];
  for(const [id,want,price,shares,fee,,rhs] of cases){
   const args={price:BigInt(price),shares:BigInt(shares),fee:BigInt(fee),rhs:BigInt(rhs)};
   const fault=want==='overflow';
   if(fault)assert.throws(()=>evaluateReference(program,args),RangeError,id);
   else assert.equal(evaluateReference(program,args),BigInt(want),id);
   vectors.push(Object.entries(args).map(([name,v])=>name+' = '+hex(v)+';').join(' ')+
    ' #1; if (result !== '+hex(fault?0n:BigInt(want))+" || fault !== 1'b"+(fault?1:0)+
    ') $fatal(1,"'+id+'");');
  }
  const dir=mkdtempSync(join(tmpdir(),'atto-debit-rtl-'));
  try{
   const rtl=join(dir,'guest.sv'),tb=join(dir,'tb.sv'),sim=join(dir,'sim');
   writeFileSync(rtl,systemVerilog);
   writeFileSync(tb,'module tb; logic signed [63:0] price, shares, fee, rhs; wire signed [63:0] result; wire fault; ores_provider_debit dut(.in_price(price),.in_shares(shares),.in_fee(fee),.in_rhs(rhs),.out_result(result),.out_fault(fault)); initial begin '+vectors.join('\n')+' $display("CHECKED_DEBIT_RTL_PASS"); $finish; end endmodule');
   execFileSync('iverilog',['-g2012','-s','tb','-o',sim,rtl,tb],{timeout:15000});
   const result=execFileSync('vvp',[sim],{encoding:'utf8',timeout:15000});
   assert.match(result,/CHECKED_DEBIT_RTL_PASS/);
  }finally{rmSync(dir,{recursive:true,force:true});}
 });
}
