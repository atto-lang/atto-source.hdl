import test from 'node:test';
import assert from 'node:assert/strict';
import {createRtlEvidence} from '../scripts/emit-rtl-evidence.mjs';

const HEAD='a'.repeat(40),TREE='b'.repeat(40);
const goodEnv=()=>({
  EXPECTED_HEAD:HEAD,
  GITHUB_ACTIONS:'true',
  GITHUB_RUN_ID:'42957492481',
  GITHUB_RUN_ATTEMPT:'2',
  GITHUB_JOB:'verify',
  GITHUB_WORKFLOW_SHA:'c'.repeat(40)
});
const data=()=>({
  'tests/fixtures/add8.atto':Buffer.from('pub fnc f(u8 a,u8 b):u8 {return a+b;}'),
  'tests/fixtures/add8.ores':Buffer.from('pub fnc f(u8 a,u8 b):u8 {return a+b;}'),
  '/tmp/oreslang_add8.sv':Buffer.from('module ores_f; endmodule'),
  'tests/fixtures/add8.generated.sv':Buffer.from('module ores_f; endmodule'),
  '/tmp/sim.log':'HDL_ADD8_65536_PASS\n',
  '/tmp/rtl-matrix.log':'RTL_MATRIX_PASS: 2070 vectors across 30 synthesized designs\n',
  '/tmp/rtl-formal.log':'HDL_SAT_EQUIVALENCE_PASS: 30 complete-width proofs; 1 mutated RTL counterexample\n',
  '/tmp/yosys-synth.log':'=== ores_add8 ===\nNumber of cells: 1\nFound and reported 0 problems.\nPrinting statistics\n'
});
const commands=(name,args)=>{
  const k=name+' '+args.join(' ');
  const results={
    'git rev-parse HEAD':HEAD,
    'git rev-parse HEAD^{tree}':TREE,
    'yosys -V':'Yosys 0.40 (git sha1 x)',
    'iverilog -V':'Icarus Verilog version 12',
    'node --version':'v22.16.0'
  };
  if(!Object.hasOwn(results,k))throw Error('unexpected mocked command '+k);
  return results[k];
};
function prove({env=goodEnv(),files=data(),run=commands}={}){
  return createRtlEvidence({
    env,
    read:(path,encoding)=>{
      if(!Object.hasOwn(files,path))throw Error('missing mock '+path);
      if(encoding==='utf8')return String(files[path]);
      return files[path];
    },
    run
  });
}
test('receipt records exact tree/attempt/hashes without promoting physical status',()=>{
  const receipt=prove();
  assert.equal(receipt.sourceCommit,HEAD);
  assert.equal(receipt.sourceTree,TREE);
  assert.equal(receipt.workflowAttempt,2);
  assert.equal(receipt.workflowRunId,'42957492481');
  assert.equal(receipt.formalEquivalenceProofs,30);
  assert.equal(receipt.negativeMutantsKilled,1);
  assert.equal(receipt.fpgaBoardVerified,false);
  assert.equal(receipt.siliconQualified,false);
  assert.equal(receipt.physicalTimingVerified,false);
  assert.match(receipt.generatedRtlSha256,/^[a-f0-9]{64}$/);
});
test('receipts deny incomplete or forged workflow identity',()=>{
  for(const changes of [
    {GITHUB_ACTIONS:'false'},
    {GITHUB_RUN_ID:''},
    {GITHUB_RUN_ATTEMPT:''},
    {GITHUB_RUN_ATTEMPT:'0'},
    {GITHUB_JOB:''},
    {EXPECTED_HEAD:'bad-sha'}
  ])assert.throws(()=>prove({env:{...goodEnv(),...changes}}),/HDL_EVIDENCE_DENIED/);
  assert.throws(()=>prove({run:(name,args)=>
    name==='git'&&args.join(' ')==='rev-parse HEAD'?'d'.repeat(40):commands(name,args)
  }),/exact-head/);
});
test('receipts deny source drift, RTL drift and incomplete execution logs',()=>{
  for(const [path,value] of [
    ['tests/fixtures/add8.ores',Buffer.from('tampered legacy source')],
    ['tests/fixtures/add8.generated.sv',Buffer.from('tampered golden RTL')],
    ['/tmp/sim.log','missing simulation'],
    ['/tmp/sim.log','HDL_ADD8_65536_PASS\nHDL_ADD8_65536_PASS\n'],
    ['/tmp/rtl-matrix.log','RTL_MATRIX_PASS: 69 vectors across 1 synthesized designs\n'],
    ['/tmp/rtl-matrix.log','RTL_MATRIX_PASS: 2070 vectors across 30 synthesized designs\nRTL_MATRIX_PASS: 2070 vectors across 30 synthesized designs\n'],
    ['/tmp/rtl-formal.log','HDL_SAT_EQUIVALENCE_PASS: 30 complete-width proofs; 0 mutated RTL counterexample\n'],
    ['/tmp/yosys-synth.log','ERROR: command failed'],
    ['/tmp/yosys-synth.log','Printing statistics\nEnd of script. Logfile hash: bad\n'],
    ['/tmp/yosys-synth.log','=== ores_add8 ===\nNumber of cells: 1\nFound and reported 1 problems.\nPrinting statistics\n'],
    ['/tmp/yosys-synth.log','=== ores_add8 ===\nNumber of cells: 1\nFound and reported 0 problems.\nERROR: missing technology mapping\nPrinting statistics\n']
  ]){
    const altered={...data(),[path]:value};
    assert.throws(()=>prove({files:altered}),/HDL_EVIDENCE_DENIED/,path);
  }
});
test('receipts deny missing tool version identity',()=>{
  for(const tool of ['yosys','iverilog','node']){
    assert.throws(()=>prove({run:(name,args)=>
      name===tool?'unknown version':commands(name,args)
    }),/required tool versions/,tool);
  }
});
