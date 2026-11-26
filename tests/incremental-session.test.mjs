import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,evaluateReference,IncrementalSession} from '../src/compiler.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const source='pub fnc calc(u8 a,u8 b): u8 { return a+b; }';
function simulate(code,expected){const dir=mkdtempSync(join(tmpdir(),'atto-hdl-incremental-'));try{
 const rtl=join(dir,'calc.sv'),tb=join(dir,'tb.sv'),out=join(dir,'sim');writeFileSync(rtl,code);
 writeFileSync(tb,"module tb; logic [7:0] a=8'd41,b=8'd1; wire [7:0] result; ores_calc dut(.in_a(a),.in_b(b),.out_result(result)); initial begin #1; if(result !== 8'd"+expected+") $fatal(1); $display(\"RTL_OK\"); $finish; end endmodule");
 execFileSync('iverilog',['-g2012','-s','tb','-o',out,rtl,tb]);assert.match(execFileSync('vvp',[out],{encoding:'utf8'}),/RTL_OK/);
 }finally{rmSync(dir,{recursive:true,force:true});}}
test('actual RTL cold/warm/edit and immutable AST',()=>{const s=new IncrementalSession();const a=s.build(source,{cold:true});assert.equal(a.reused,false);assert.equal(a.systemVerilog,compileSource(source).systemVerilog);simulate(a.systemVerilog,42);
 const b=s.build(source);assert.equal(b.reused,true);assert.equal(b.systemVerilog,a.systemVerilog);simulate(b.systemVerilog,42);assert.throws(()=>{b.program.params[0].width=32;},TypeError);b.systemVerilog='forged';assert.equal(s.build(source).systemVerilog,a.systemVerilog);
 const edit=source.replace('a+b','a-b');const c=s.build(edit);assert.equal(c.reused,false);assert.equal(c.systemVerilog,compileSource(edit).systemVerilog);simulate(c.systemVerilog,40);assert.equal(evaluateReference(c.program,{a:41n,b:1n}),40n);
 assert.throws(()=>s.build(edit.replace('a-b','missing')),e=>e.code==='HDL_UNBOUND');assert.equal(s.build(edit).reused,true);console.log('INCREMENTAL_HDL|actual-rtl=42/40|immutable|rollback');});

import {TrustedArtifactStore} from '../src/compiler-artifact-store.node.mjs';
import {encodeCacheKey,makeLedgerRecord} from '../src/compiler-cache-envelope.node.mjs';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
const aSource=source, bSource=aSource.replace('a+b','a-b'), badSource=bSource.replace('a-b','missing');
const hash=b=>createHash('sha256').update(b).digest();
const master=Buffer.alloc(32,7),record=makeLedgerRecord('tenant/a',2n,master),pin=hash(record);
const auth=['tenant/a',record,pin,master];
function artifactKey(s){
 const digest=b=>hash(b).toString('hex');
 // Fixture closure only; production host must attest all dependencies.
 const compiler=digest(fs.readFileSync(new URL('../src/compiler.mjs',import.meta.url)));
 return encodeCacheKey({stage:'rtl',owner:'@test/cache',unitKind:'source-unit',unit:'main.atto',compiler,
 toolchain:digest(process.version),target:digest('systemverilog'),configuration:digest('closed-scalar-fixture'),
 sources:digest(s),bindings:digest('no imports'),generated:null,dependencies:[]});
}
const fresh=s=>compileSource(s).systemVerilog;
function cached(root,s,cold=false,requireHit=false){
 const store=new TrustedArtifactStore(root),key=artifactKey(s);
 if(!cold){const hit=store.load(key,...auth);if(hit!==null)return {code:hit.toString('utf8'),reused:true};}
 if(requireHit)throw Error('unexpected compiler invocation on restart');
 const code=fresh(s);store.publish(key,Buffer.from(code),...auth);return {code,reused:false};
}
async function executeCached(code,expected){simulate(code,expected);}
test('persistent compiler output executes across process restart',async()=>{
 const child=process.env.ATTO_CACHE_FIXTURE_CHILD;
 if(child){const warm=cached(child,aSource,false,true);assert.equal(warm.reused,true);await executeCached(warm.code,42);console.log('PERSISTENT_NODE_CHILD|no-compile|guest=42');return;}
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atto-cache-'));try{
 const cold=cached(root,aSource,true);assert.equal(cold.reused,false);assert.equal(cold.code,fresh(aSource));await executeCached(cold.code,42);
 const p=spawnSync(process.execPath,['--test','--test-name-pattern=persistent compiler output',new URL(import.meta.url).pathname],{env:{...process.env,ATTO_CACHE_FIXTURE_CHILD:root},encoding:'utf8',timeout:60000});
 assert.equal(p.status,0,p.stdout+p.stderr);assert.match(p.stdout,/PERSISTENT_NODE_CHILD/);
 const edited=cached(root,bSource);assert.equal(edited.reused,false);assert.equal(edited.code,fresh(bSource));await executeCached(edited.code,40);
 const file=path.join(root,'slot-'+artifactKey(bSource)[0]),before=fs.readFileSync(file);
 assert.throws(()=>cached(root,badSource,true));assert.deepEqual(fs.readFileSync(file),before);assert.equal(cached(root,bSource,false,true).code,edited.code);
 const store=new TrustedArtifactStore(root);
 assert.throws(()=>store.load(artifactKey(bSource),'tenant/a',record,Buffer.alloc(32),master),/E_CACHE_LEDGER/);
 fs.chmodSync(file,0o644);assert.throws(()=>cached(root,bSource,false,true),/E_CACHE_PATH/);fs.chmodSync(file,0o600);
 fs.renameSync(file,file+'.saved');fs.symlinkSync(file+'.saved',file);assert.throws(()=>cached(root,bSource,false,true),/E_CACHE_PATH/);
 fs.unlinkSync(file);fs.renameSync(file+'.saved',file);
 const corrupt=Buffer.from(before);corrupt[80]^=1;fs.writeFileSync(file,corrupt);assert.throws(()=>cached(root,bSource,false,true),/E_CACHE_RECEIPT/);
 console.log('PERSISTENT_HDL|cold=42|warm-child=42|edit=40|rollback|corruption-and-links-denied');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
