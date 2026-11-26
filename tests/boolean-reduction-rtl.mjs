import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileBooleanReduction as compile} from '../src/boolean_reduction.mjs';
const dir=mkdtempSync(join(tmpdir(),'atto-hdl-bool-'));
function run(cmd,args){
 const r=spawnSync(cmd,args,{cwd:dir,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
 assert.ifError(r.error);assert.equal(r.signal,null);assert.equal(r.status,0,cmd+': '+r.stderr);
 return r.stdout;
}
let vectors=0,designs=0;
try{
 for(const [expr,oracle] of [
  ['And(a,b,c,d)',x=>x.every(Boolean)],['Or(a,b,c,d)',x=>x.some(Boolean)],['Xor(a,b,c,d)',x=>x.filter(Boolean).length%2===1],
  ['And([a,b,c,d])',x=>x.every(Boolean)],['Or([a,b,c,d])',x=>x.some(Boolean)],['Xor([a,b,c,d])',x=>x.filter(Boolean).length%2===1],
  ['And([])',()=>true],['Or([])',()=>false],['Xor([])',()=>false],
  ['Xor([a])',x=>x[0]],['!a || b && c',x=>!x[0]||x[1]&&x[2]],['Xor(And(a,b),Or(c,d))',x=>(x[0]&&x[1])!==(x[2]||x[3])],
 ]){
  const r=compile('fnc gate(bool a,bool b,bool c,bool d):bool {return '+expr+';}');
  writeFileSync(join(dir,'design.sv'),r.systemVerilog);
  const lines=[];
  for(let mask=0;mask<16;mask++){
   const x=Array.from({length:4},(_,i)=>Boolean(mask&(1<<i)));
   lines.push(x.map((v,i)=>'in_'+i+"=1'b"+Number(v)+';').join(' ')+" #1; if(out_result !== 1'b"+Number(oracle(x))+') $fatal(1,"vector '+mask+'");');
  }
  writeFileSync(join(dir,'tb.sv'),'module tb; reg in_0,in_1,in_2,in_3; wire out_result; atto_bool_gate dut(.in_0(in_0),.in_1(in_1),.in_2(in_2),.in_3(in_3),.out_result(out_result)); initial begin\n'+lines.join('\n')+'\n$display("ATTO_BOOL_RTL_PASS"); $finish; end endmodule\n');
  run('iverilog',['-g2012','-s','tb','-o','rtl.vvp','design.sv','tb.sv']);
  assert.match(run('vvp',['rtl.vvp']),/^ATTO_BOOL_RTL_PASS$/m);
  run('yosys',['-Q','-T','-p','read_verilog -sv design.sv; hierarchy -check -top atto_bool_gate; synth -top atto_bool_gate; check -assert; write_verilog -noattr netlist.v']);
  run('iverilog',['-g2012','-s','tb','-o','net.vvp','netlist.v','tb.sv']);
  assert.match(run('vvp',['net.vvp']),/^ATTO_BOOL_RTL_PASS$/m);
  vectors+=32;designs++;
 }
 console.log(JSON.stringify({designs,rtl_and_netlist_vectors:vectors}));
}finally{rmSync(dir,{recursive:true,force:true});}
