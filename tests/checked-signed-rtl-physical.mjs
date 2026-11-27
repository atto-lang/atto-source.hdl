import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {compileCheckedNamespaceProvider,evaluateReference} from '../src/compiler.mjs';
const min=-(1n<<63n),max=(1n<<63n)-1n;
const check=n=>{if(n<min||n>max)throw RangeError('overflow');return n;};
const cases=[
 ['x + y',(x,y)=>check(x+y)],
 ['x - y',(x,y)=>check(x-y)],
 ['x * y',(x,y)=>check(x*y)],
 ['(x + 1) - 1',(x)=>check(check(x+1n)-1n)],
 ['-x',(x)=>check(-x)],
 ['x * y + 2',(x,y)=>check(check(x*y)+2n)],
 ['(x * y) - (x * y)',(x,y)=>check(check(x*y)-check(x*y))]
];
const edges=[min,min+1n,-4294967296n,-1n,0n,1n,2n,4294967296n,max-1n,max];
const vectors=edges.flatMap(x=>edges.map(y=>[x,y]));
const hex=n=>"64'h"+BigInt.asUintN(64,n).toString(16).padStart(16,'0');
const dir=mkdtempSync(join(tmpdir(),'atto-signed-rtl-'));
function run(cmd,args){
 const r=spawnSync(cmd,args,{cwd:dir,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
 if(r.error)throw r.error;
 assert.equal(r.status,0,cmd+' '+r.stderr+' '+r.stdout);
 return r.stdout;
}
try{
 for(const [i,[expr,oracle]] of cases.entries()){
  const source='namespace billing;\npub fnc function0(int x, int y): int { return '+expr+'; }\n';
  const {program,systemVerilog}=compileCheckedNamespaceProvider(source,'billing','function0',2);
  const assertions=vectors.map(([x,y],j)=>{
   let fault=0,value=0n;
   try{value=oracle(x,y);}catch(e){assert.ok(e instanceof RangeError);fault=1;}
   if(fault)assert.throws(()=>evaluateReference(program,{x,y}),RangeError);
   else assert.equal(evaluateReference(program,{x,y}),value);
   return 'in_x='+hex(x)+'; in_y='+hex(y)+'; #1; if (out_fault !== 1\'b'+fault+' || out_result !== '+hex(value)+') $fatal(1,"vector '+j+'");';
  });
  writeFileSync(join(dir,'dut.sv'),systemVerilog);
  writeFileSync(join(dir,'tb.sv'),[
   'module tb; reg signed [63:0] in_x,in_y; wire signed [63:0] out_result; wire out_fault;',
   'ores_provider_function0 dut(.in_x(in_x),.in_y(in_y),.out_result(out_result),.out_fault(out_fault));',
   'initial begin',...assertions,'$display("SIGNED_RTL_PASS '+i+' '+vectors.length+'"); $finish; end endmodule'
  ].join('\n'));
  run('iverilog',['-g2012','-s','tb','-o','sim','dut.sv','tb.sv']);
  console.log(run('vvp',['sim']).trim());
  // Independent synthesis/structural checks; never substitute host evaluation
  // for the actual RTL simulation above. Technology mapping is not claimed.
  run('yosys',['-Q','-T','-p','read_verilog -sv dut.sv; hierarchy -check -top ores_provider_function0; proc; opt; check -assert; write_verilog netlist.v']);
  run('iverilog',['-g2012','-s','tb','-o','net-sim','netlist.v','tb.sv']);
  console.log('NETLIST '+run('vvp',['net-sim']).trim());
 }
 console.log('CHECKED_SIGNED_RTL_CENSUS '+cases.length+' designs '+(cases.length*vectors.length)+' RTL vectors '+(cases.length*vectors.length)+' synthesized-netlist vectors');
}finally{rmSync(dir,{recursive:true,force:true});}
