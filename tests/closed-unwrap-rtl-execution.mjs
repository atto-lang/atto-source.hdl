// Restricted closed unwrap: execute real emitted RTL and synthesized netlist.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileSource} from '../src/compiler.mjs';

const cases=[
 ['None','42',42n],['Some(7)','42',7n],['Some(0)','42',0n],
 ['Some(-9223372036854775808)','42',-(1n<<63n)],
 ['Some(9223372036854775807)','42',(1n<<63n)-1n],
 ['None','-9223372036854775808',-(1n<<63n)],
 ['Some(84/2)','7',42n]
];
const source=(init,fallback)=>`pub fnc main():int {
 val Option<int> x = ${init};
 return trap! x.unwrap() |> match<int> over
 on Ok(n):int -> n, on Err():int -> ${fallback}, end;
}`;
function run(cmd,args,cwd){
 const r=spawnSync(cmd,args,{cwd,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
 if(r.error || r.signal || r.status!==0)throw new Error(cmd+' failed: '+(r.error?.message||r.stderr||r.stdout));
 return r.stdout;
}
const dir=mkdtempSync(join(tmpdir(),'atto-hdl-unwrap-'));
try {
 for(const [init,fallback,want] of cases){
  const {systemVerilog}=compileSource(source(init,fallback));
  const top=systemVerilog.match(/\bmodule\s+([A-Za-z_][A-Za-z0-9_]*)\b/)?.[1];
  assert.ok(top,'missing compiler-emitted module');
  const expected=BigInt.asUintN(64,want).toString(16).padStart(16,'0');
  writeFileSync(join(dir,'design.sv'),systemVerilog);
  writeFileSync(join(dir,'tb.sv'),`module tb;
 wire signed [63:0] out_result;
 ${top} dut(.out_result(out_result));
 initial begin #1;
 if(out_result !== 64'h${expected}) $fatal(1,"unwrap mismatch");
 $display("ATTO_HDL_UNWRAP_PASS"); $finish; end
 endmodule\n`);
  run('iverilog',['-g2012','-s','tb','-o','rtl.vvp','design.sv','tb.sv'],dir);
  assert.match(run('vvp',['rtl.vvp'],dir),/^ATTO_HDL_UNWRAP_PASS$/m);
  run('yosys',['-Q','-T','-p',`read_verilog -sv design.sv; hierarchy -check -top ${top}; synth -top ${top}; check -assert; write_verilog -noattr netlist.v`],dir);
  run('iverilog',['-g2012','-s','tb','-o','net.vvp','netlist.v','tb.sv'],dir);
  assert.match(run('vvp',['net.vvp'],dir),/^ATTO_HDL_UNWRAP_PASS$/m);
  console.log('HDL_RESTRICTED_RTL_AND_NETLIST_PASS '+init+' fallback='+fallback+' result='+want);
 }
 for(const invalid of [source('Some(42/0)','42'),source('None','42/0'),source('None','42').replace('unwrap()','unwrap(1)'),source('None','42').replace('Err()','Err(e)')])
  assert.throws(()=>compileSource(invalid),{name:'HardwareSourceError'});
 console.log(JSON.stringify({evidence_kind:'RESTRICTED_CLOSED_RTL_AND_NETLIST_EXECUTION',cases:cases.length,simulations:cases.length*2,negative_cases:4,runtime_error_abi:false}));
} finally {rmSync(dir,{recursive:true,force:true});}
