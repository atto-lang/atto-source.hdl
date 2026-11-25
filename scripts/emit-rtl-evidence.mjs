// This is an evidence *recorder* for an already-executed exact-head CI job.
// It never performs synthesis, signs evidence, or asserts physical qualification.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const reject=(message)=>{throw new Error('HDL_EVIDENCE_DENIED: '+message);};
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const hex40=v=>typeof v==='string' && /^[0-9a-f]{40}$/.test(v);
const integer=v=>typeof v==='string' && /^[1-9][0-9]*$/.test(v);
const exactlyOne=(text,line)=>text.split(/\r?\n/).filter(x=>x===line).length===1;

function command(name,args){
  const r=spawnSync(name,args,{encoding:'utf8',timeout:20000,maxBuffer:512*1024});
  if(r.error||r.signal||r.status!==0)reject('command failed: '+name);
  const output=(r.stdout||'').trim();
  if(!output)reject('missing output: '+name);
  return output;
}

export function createRtlEvidence({env=process.env,read=readFileSync,run=command}={}){
  const head=env.EXPECTED_HEAD;
  if(!hex40(head))reject('missing exact expected HEAD');
  if(env.GITHUB_ACTIONS!=='true' || !integer(env.GITHUB_RUN_ID) ||
     !integer(env.GITHUB_RUN_ATTEMPT) ||
     !/^[A-Za-z_][A-Za-z_0-9-]{0,127}$/.test(env.GITHUB_JOB??''))
    reject('missing GitHub Actions execution context (local receipt is not an attestation)');
  const realHead=run('git',['rev-parse','HEAD']);
  const tree=run('git',['rev-parse','HEAD^{tree}']);
  if(realHead!==head||!hex40(tree))reject('checkout not at pinned exact-head Git tree');
  const files={
    atto:read('tests/fixtures/add8.atto'),
    legacy:read('tests/fixtures/add8.ores'),
    generated:read('/tmp/oreslang_add8.sv'),
    golden:read('tests/fixtures/add8.generated.sv')
  };
  if(Buffer.compare(files.atto,files.legacy)!==0)
    reject('canonical .atto source differs from pinned .ores source');
  if(Buffer.compare(files.generated,files.golden)!==0)
    reject('RTL differs from pinned golden');
  const logs={
    simulation:read('/tmp/sim.log','utf8'),
    rtlMatrix:read('/tmp/rtl-matrix.log','utf8'),
    formal:read('/tmp/rtl-formal.log','utf8'),
    synthesis:read('/tmp/yosys-synth.log','utf8')
  };
  if(!exactlyOne(logs.simulation,'HDL_ADD8_65536_PASS'))
    reject('missing exhaustive Icarus RTL simulation sentinel');
  if(!exactlyOne(logs.rtlMatrix,'RTL_MATRIX_PASS: 2070 vectors across 30 synthesized designs'))
    reject('missing complete cross-width RTL matrix sentinel');
  if(!exactlyOne(logs.formal,
    'HDL_SAT_EQUIVALENCE_PASS: 30 complete-width proofs; 1 mutated RTL counterexample'))
    reject('missing real SAT equivalence plus negative-mutant sentinel');
  // CI invokes Yosys with -T, which suppresses its optional end-of-script
  // footer. The preceding pipefail-bound synthesis command must exit zero.
  // Check for actual synthesis/stat and clean design reports, not a footer.
  if(!/=== ores_add8 ===/.test(logs.synthesis) ||
     !/Number of cells:/i.test(logs.synthesis) ||
     !/Found and reported 0 problems\./i.test(logs.synthesis) ||
     !/Printing statistics/i.test(logs.synthesis) ||
     /ERROR:|warning:.*latch/i.test(logs.synthesis))
    reject('Yosys synthesis log missing successful netlist and design-check witnesses');
  const yosys=run('yosys',['-V']).split('\n')[0];
  const iverilog=run('iverilog',['-V']).split('\n')[0];
  const node=run('node',['--version']).split('\n')[0];
  if(!/^Yosys /i.test(yosys) || !/Icarus Verilog/i.test(iverilog) ||
     !/^v22\./.test(node))
    reject('required tool versions not recorded');
  const sourceSha=sha256(files.atto),rtlSha=sha256(files.generated);
  return {
    schemaVersion:2,
    sourceCommit:head,
    sourceTree:tree,
    sourcePath:'tests/fixtures/add8.atto',
    sourceSha256:sourceSha,
    legacySourceSha256:sha256(files.legacy),
    generatedRtlSha256:rtlSha,
    rtlSha256:rtlSha, // compatibility alias; still requires independent run validation
    goldenRtlSha256:sha256(files.golden),
    workflowRunId:env.GITHUB_RUN_ID,
    workflowAttempt:Number(env.GITHUB_RUN_ATTEMPT),
    workflowJob:env.GITHUB_JOB,
    workflowSha:hex40(env.GITHUB_WORKFLOW_SHA)?env.GITHUB_WORKFLOW_SHA:null,
    ciEvidenceClass:'RTL_SIMULATION_GENERIC_SYNTHESIS_SAT_EQUIVALENCE_ONLY',
    simulationVectors:65536,
    rtlMatrixDesigns:30,
    rtlMatrixVectors:2070,
    formalEquivalenceProofs:30,
    negativeMutantsKilled:1,
    toolVersions:{node,iverilog,yosys},
    logSha256:Object.fromEntries(Object.entries(logs).map(([key,value])=>[key,sha256(value)])),
    fpgaBoardVerified:false,
    siliconQualified:false,
    physicalTimingVerified:false
  };
}

if(process.argv[1] && resolve(process.argv[1])===new URL(import.meta.url).pathname){
  try{
    const receipt=createRtlEvidence();
    const output='/tmp/hdl-evidence.json';
    writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('HDL_EVIDENCE_RECORDED: '+receipt.sourceCommit+
      ' run '+receipt.workflowRunId+' attempt '+receipt.workflowAttempt);
  }catch(e){
    console.error(e instanceof Error?e.message:String(e));
    process.exitCode=1;
  }
}
