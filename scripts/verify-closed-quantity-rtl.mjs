// Exact shared corpus through actual CLI, RTL simulation and synthesized netlist.
// Run with the authenticated atto-platform-conformance checkout as argument.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const corpus=resolve(process.argv[2]??'');
assert.ok(process.argv[2]);
assert.equal(process.env.ATTO_VERIFIED_CAST_ASCRIPTION,'1');
const {expandQuantityCases}=await import(pathToFileURL(join(corpus,'lib/verified-core-quantity-expansion.mjs')));
const original=join(corpus,'fixtures/verified-core-quantities-v1');
const manifest=JSON.parse(readFileSync(join(original,'cases.json'),'utf8'));
const work=mkdtempSync(join(tmpdir(),'atto-rtl-quantity-'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const cli=fileURLToPath(new URL('../bin/oreslang-hdl.mjs',import.meta.url));
function run(cmd,args){
 const r=spawnSync(cmd,args,{cwd:work,encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
 if(r.error)throw r.error;assert.equal(r.signal,null,cmd);return r;
}
function ok(r,id){assert.equal(r.status,0,id+': '+r.stderr);}
let values=0,diagnostics=0,staticTraps=0;const failures=[];
try{
 const {fixtures,cases}=expandQuantityCases(original,work,manifest);
 assert.equal(cases.length,151);
 const tb=join(work,'tb.sv');
 writeFileSync(tb,`module tb;
wire signed [63:0] result;
ores_main dut(.out_result(result));
initial begin #1; $display("%0d", $signed(result)); $finish; end
endmodule
`);
 for(const {source,expected} of cases){
  try{
   assert.match(source,/^[a-z0-9-]+\.atto$/);
   const input=join(fixtures,source),rtl=join(work,source+'.sv'),synth=join(work,source+'.net.v');
   const r=run(process.execPath,[cli,input,rtl]);
   if(expected.kind==='value'){
    ok(r,source);assert.ok(existsSync(rtl));
    const binary=join(work,source+'.sim');
    ok(run('iverilog',['-g2012','-s','tb','-o',binary,rtl,tb]),source+' RTL build');
    const sim=run('vvp',[binary]);ok(sim,source+' RTL execution');assert.equal(sim.stdout.split('\n')[0],expected.decimal,source);
    ok(run('yosys',['-Q','-T','-p','read_verilog -sv '+rtl+'; synth -top ores_main; check -assert; write_verilog -noattr '+synth]),source+' synthesis');
    ok(run('iverilog',['-g2012','-s','tb','-o',binary,synth,tb]),source+' netlist build');
    const net=run('vvp',[binary]);ok(net,source+' netlist execution');assert.equal(net.stdout.split('\n')[0],expected.decimal,source);
    values++;console.log('HDL_SYNTH_SIM_PASS '+source+' '+sha(input)+' '+sha(rtl)+' '+sha(synth));
   }else{
    assert.equal(r.status,1,source+': '+r.stderr);assert.equal(r.stdout,'',source);assert.ok(!existsSync(rtl),source);
    if(expected.kind==='diagnostic'){assert.match(r.stderr,new RegExp('^'+expected.category+' '),source);diagnostics++;}
    else{assert.equal(expected.kind,'arithmeticFailure');assert.match(r.stderr,/^HDL_STATIC_ARITHMETIC /,source);assert.ok(r.stderr.includes(expected.category),source);staticTraps++;}
    console.log('HDL_STATIC_REJECT '+source+' '+expected.kind+' '+expected.category+' '+sha(input));
   }
  }catch(e){failures.push(source);console.error('HDL_FAIL '+source+' '+String(e.message));}
 }
 console.log('HDL_QUANTITY_RESULT '+JSON.stringify({values,diagnostics,staticTraps,total:cases.length,failures}));
 assert.equal(failures.length,0);
}finally{rmSync(work,{recursive:true,force:true});}
