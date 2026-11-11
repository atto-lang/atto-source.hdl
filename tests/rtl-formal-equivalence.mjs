// Real Yosys SAT equivalence between compiler-generated combinational RTL and
// a separate, independently-authored arithmetic reference circuit.
// A passing host JS reference oracle alone is NOT this proof.
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {compileSource} from '../src/compiler.mjs';
import {requireYosysSatResult} from '../src/formal-proof-result.mjs';

const widths=[1,8,16,32,64];
const operations=[
  {name:'add',source:'a + b',rtl:'+'},
  {name:'sub',source:'a - b',rtl:'-'},
  {name:'named-bitxor',source:'Integer.bitXor(a,b)',rtl:'^'}
];
const dir=mkdtempSync(join(tmpdir(),'atto-hdl-formal-'));
const design=join(dir,'design.sv'),spec=join(dir,'spec.sv');
const script=(expectEquivalent)=>[
  'read_verilog -sv design.sv spec.sv',
  'proc',
  'opt',
  'miter -equiv -make_assert gold ores_f miter',
  'flatten miter',
  'sat '+(expectEquivalent?'-verify':'-falsify')+
    ' -prove-asserts -show-inputs -show-outputs miter'
].join('; ');
function prove(expectEquivalent,context){
  const run=spawnSync('yosys',['-Q','-T','-p',script(expectEquivalent)],{
    cwd:dir,encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,
    env:{...process.env,LC_ALL:'C'}
  });
  requireYosysSatResult(run,expectEquivalent,context);
}
let proven=0,mutantsKilled=0;
try{
  for(const width of widths)for(const op of operations){
    const s='fnc f(u'+width+' a,u'+width+' b):u'+width+' { return '+op.source+'; }';
    const {systemVerilog}=compileSource(s);
    const gold='module gold(\n'+
      '  input logic ['+(width-1)+':0] in_a,\n'+
      '  input logic ['+(width-1)+':0] in_b,\n'+
      '  output logic ['+(width-1)+':0] out_result\n'+
      ');\n  assign out_result = in_a '+op.rtl+' in_b;\nendmodule\n';
    writeFileSync(design,systemVerilog,{flag:'w',mode:0o600});
    writeFileSync(spec,gold,{flag:'w',mode:0o600});
    prove(true,op.name+' u'+width);
    proven++;
    if(width===8 && op.name==='named-bitxor'){
      const wrong=systemVerilog.replace('assign out_result = (in_a ^ in_b);',
        'assign out_result = (in_a & in_b);');
      if(wrong===systemVerilog)throw Error('mutation control failed to alter source RTL');
      writeFileSync(design,wrong,{flag:'w',mode:0o600});
      prove(false,'negative mutated XOR u8');
      mutantsKilled++;
    }
  }
  if(proven!==15||mutantsKilled!==1)
    throw Error('formal test count truncated');
  console.log('HDL_SAT_EQUIVALENCE_PASS: '+proven+' complete-width proofs; '+mutantsKilled+' mutated RTL counterexample');
}finally{
  rmSync(dir,{recursive:true,force:true});
}
