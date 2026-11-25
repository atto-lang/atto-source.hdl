import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileSource,evaluateReference} from '../src/compiler.mjs';

const widths=[1,8,16,32,64],ops=['+','-','&','|','^^','bitXor'];
const dir=mkdtempSync(join(tmpdir(),'ores-hdl-rtl-'));
function run(cmd,args){
  const r=spawnSync(cmd,args,{encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  if(r.error||r.status!==0)throw new Error(cmd+' failed: '+(r.error?.message??r.stderr??r.stdout));
  return r.stdout;
}
let checked=0;
try{
  for(const width of widths)for(const [index,op] of ops.entries()){
    const expr=op==='bitXor'?'Integer.bitXor(a,b)':'a '+op+' b';
    const {program,systemVerilog}=compileSource('fnc f(u'+width+' a,u'+width+' b):u'+width+' { return '+expr+'; }');
    const mask=(1n<<BigInt(width))-1n;
    const vectors=[[0n,0n],[mask,1n],[mask,mask],[1n,mask],[mask>>1n,mask]];
    let seed=BigInt(width*101+index*17+1);
    for(let k=0;k<64;k++){
      seed=(seed*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);
      const a=seed&mask;
      seed=(seed*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);
      vectors.push([a,seed&mask]);
    }
    const lines=vectors.map(([a,b],i)=>{
      const expected=evaluateReference(program,{a,b});
      return "    in_a = "+width+"'h"+a.toString(16)+"; in_b = "+width+"'h"+b.toString(16)+"; #1; if(out_result !== "+width+"'h"+expected.toString(16)+") $fatal(1, \"vector "+i+" width "+width+" op "+op+"\");";
    });
    const tb='module tb; reg ['+(width-1)+':0] in_a,in_b; wire ['+(width-1)+':0] out_result; ores_f dut(.in_a(in_a),.in_b(in_b),.out_result(out_result)); initial begin\n'+lines.join('\n')+'\n$display("RTL_MATRIX_PASS"); $finish; end endmodule\n';
    const rtl=join(dir,'design.sv'),bench=join(dir,'tb.sv'),out=join(dir,'sim.vvp');
    writeFileSync(rtl,systemVerilog);writeFileSync(bench,tb);
    run('iverilog',['-g2012','-s','tb','-o',out,rtl,bench]);
    if(!run('vvp',[out]).includes('RTL_MATRIX_PASS'))throw new Error('missing simulation sentinel');
    run('yosys',['-Q','-T','-p','read_verilog -sv '+rtl+'; hierarchy -check -top ores_f; proc; opt; check -assert; synth -top ores_f; check -assert']);
    checked+=vectors.length;
  }
  console.log('RTL_MATRIX_PASS: '+checked+' vectors across '+widths.length*ops.length+' synthesized designs');
}finally{rmSync(dir,{recursive:true,force:true});}
