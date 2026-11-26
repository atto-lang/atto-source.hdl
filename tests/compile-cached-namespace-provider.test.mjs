import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {compileCachedNamespaceProvider,providerCompilerClosureSha256} from '../src/compile-cached-namespace-provider.node.mjs';
import {compileCheckedNamespaceProvider} from '../src/compiler.mjs';
import {makeLedgerRecord} from '../src/compiler-cache-envelope.node.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const scope='tenant/provider',master=Buffer.alloc(32,7),ledgerRecord=makeLedgerRecord(scope,1n,master),ledgerPin=Buffer.from(hash(ledgerRecord),'hex');
const original=[{path:'src/billing.atto',namespace:'billing',symbol:'get',arity:2,source:'namespace billing;\npub fnc get(int x, int y): int { return x * y + 2; }\n'},
 {path:'src/identity.atto',namespace:'identity',symbol:'other',arity:0,source:'namespace identity;\npub fnc other(): int { return 900; }\n'}];
const local=[original[0],{...original[1],source:original[1].source.replace('900','901')}];
function options(root,inventory=original){
 const sorted=[...inventory].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 return {root,owner:'client@1',inventory,namespace:'billing',symbol:'get',arity:2,
 expectedManifestSha256:hash('atto.hdl.provider-inventory.v1\n'+sorted.map(p=>p.path+'\n'+p.namespace+'\n'+p.symbol+'\n'+p.arity+'\n').join('')),
 expectedSourcesSha256:hash('atto.hdl.provider-sources.v1\n'+sorted.map(p=>p.path+'\n'+hash(p.source)+'\n').join('')),
 expectedCompilerSha256:providerCompilerClosureSha256(),scope,master,ledgerRecord,ledgerPin};
}
function execute(root,code,expected){
 const rtl=join(root,'provider.sv'),tb=join(root,'bench.sv'),sim=join(root,'guest');
 writeFileSync(rtl,code);
 writeFileSync(tb,[
  'module bench;',
  'reg signed [63:0] x,y; wire signed [63:0] result; wire fault;',
  'ores_provider_get dut(.in_x(x),.in_y(y),.out_result(result),.out_fault(fault));',
  'initial begin',
  'x=10; y=4; #1; if(fault!==0 || result!==64\'sd'+expected+') $fatal(1,"normal");',
  'x=64\'sh7fffffffffffffff; y=2; #1; if(fault!==1 || result!==0) $fatal(1,"overflow");',
  'x=10; y=4; #1; if(fault!==0 || result!==64\'sd'+expected+') $fatal(1,"recovery");',
  '$display("HDL_BOUND_GUEST|'+expected+'|overflow|recovery"); $finish;',
  'end endmodule'].join('\n'));
 const cc=spawnSync('iverilog',['-g2012','-s','bench','-o',sim,rtl,tb],{encoding:'utf8',timeout:30000});
 assert.equal(cc.status,0,cc.error?.message||cc.stderr);
 const run=spawnSync('vvp',[sim],{encoding:'utf8',timeout:30000});
 assert.equal(run.status,0,run.error?.message||run.stdout+run.stderr);
 assert.match(run.stdout,new RegExp('HDL_BOUND_GUEST\\|'+expected+'\\|overflow\\|recovery'));
 console.log(run.stdout.trim());
}
const disk=root=>new Map(readdirSync(root).sort().map(n=>[n,readFileSync(join(root,n))]));
test('persistent checked RTL, unrelated edit, process restart and current admission',()=>{
 const child=process.env.ATTO_HDL_BOUND_CHILD;
 if(child){
  const a=compileCachedNamespaceProvider(options(join(child,'cache'),local));
  assert.equal(a.reused,1);assert.equal(a.emitted,0);execute(child,a.code,42);console.log('HDL_BOUND_CHILD|hit');return;
 }
 const root=mkdtempSync(join(tmpdir(),'atto-hdl-bound-'));
 try{
  const cache=join(root,'cache'); // private cache directory created separately from simulation files
  const {status}=spawnSync('mkdir',['-m','700',cache]);assert.equal(status,0);
  const opts=options(cache),a=compileCachedNamespaceProvider(opts);
  assert.equal(a.emitted,1);assert.equal(a.code,compileCheckedNamespaceProvider(original[0].source,'billing','get',2).systemVerilog);
  execute(root,a.code,42);
  const before=disk(cache),b=compileCachedNamespaceProvider(options(cache,local));
  assert.equal(b.key,a.key);assert.equal(b.reused,1);assert.equal(b.emitted,0);assert.equal(b.admitted,2);assert.deepEqual(disk(cache),before);
  assert.throws(()=>compileCachedNamespaceProvider({...opts,inventory:local}),/E_NAMESPACE_PIN/);
  assert.throws(()=>compileCachedNamespaceProvider({...opts,arity:1}),/E_NAMESPACE_ARITY/);
  assert.throws(()=>compileCachedNamespaceProvider({...opts,ledgerPin:Buffer.alloc(32)}),/E_CACHE_LEDGER/);
  const bad=[local[0],{...local[1],source:local[1].source.replace('901','missing')}];
  assert.throws(()=>compileCachedNamespaceProvider(options(cache,bad)),/E_NAMESPACE_PROFILE/);
  assert.throws(()=>compileCachedNamespaceProvider({...opts,inventory:[original[0],original[0]]}),/E_NAMESPACE_INVENTORY/);
  let touched=false;const accessor={...original[1]};Object.defineProperty(accessor,'source',{get(){touched=true;return original[1].source;}});
  assert.throws(()=>compileCachedNamespaceProvider({...opts,inventory:[original[0],accessor]}),/E_NAMESPACE_INVENTORY/);assert.equal(touched,false);
  assert.deepEqual(disk(cache),before);
  const env={...process.env,ATTO_HDL_BOUND_CHILD:root};delete env.NODE_TEST_CONTEXT;
  const p=spawnSync(process.execPath,['--test','--test-reporter=tap',new URL(import.meta.url).pathname],{env,encoding:'utf8',timeout:60000});
  assert.equal(p.status,0,p.stdout+p.stderr);assert.match(p.stdout,/HDL_BOUND_CHILD\|hit/);
  const edit=[{...local[0],source:local[0].source.replace('+ 2','+ 3')},local[1]];
  const c=compileCachedNamespaceProvider(options(cache,edit));
  assert.equal(c.emitted,1);assert.notEqual(c.key,a.key);assert.equal(c.code,compileCheckedNamespaceProvider(edit[0].source,'billing','get',2).systemVerilog);execute(root,c.code,43);
  const rename=[edit[0],{...edit[1],path:'src/renamed.atto'}];
  const d=compileCachedNamespaceProvider(options(cache,rename));assert.equal(d.emitted,1);assert.notEqual(d.key,c.key);assert.equal(d.code,c.code);
  console.log('HDL_BOUND_PROVIDER|42/42/43|local-edit-hit|restart-hit|overflow-recovery|manifest-miss|clean-equivalent');
 }finally{rmSync(root,{recursive:true,force:true});}
});
