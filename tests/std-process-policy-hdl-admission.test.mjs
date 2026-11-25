import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileSource,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';
const reject=e=>e instanceof HardwareSourceError && e.code==='HDL_LIBRARY_PROFILE_UNSUPPORTED';
test('process policy: target rejects actual unsupported imports before RTL',()=>{
  for(const path of ["std/process","atto.std/process","std/process_policy","atto.std/process_policy"]) {
    const source='import module lib from "'+path+'"; fnc pass(u8 a):u8 {return a;}';
    for(const compile of [parseHardwareSource,compileSource]) assert.throws(()=>compile(source),reject,path);
  }
  for(const path of ["tests/fixtures/std-process-policy-v1/main.atto","stdlib/process_policy.atto"]) {
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
    assert.throws(()=>compileSource(source),HardwareSourceError,path);
  }
  const clean='fnc pass(u8 a):u8 {return a;}';
  assert.equal(compileSource('/* import module lib from "std/unsupported"; */ '+clean).systemVerilog,compileSource(clean).systemVerilog);
});
test('process policy source retains bounded arithmetic and never launches a process',()=>{
 const src=readFileSync(new URL('../stdlib/process_policy.atto',import.meta.url),'utf8').replace(/\/\/[^\n]*/g,'');
 for(const token of ['additional_bytes <= total_budget - reserved_bytes','incoming <= capacity - buffered','now_ns - started_ns >= duration_ns','now_ns - requested_ns >= grace_ns']) assert.ok(src.includes(token),token);
 assert.doesNotMatch(src,/\b(?:spawn|fork|exec|shell|await)\s*\(/);
 const cap=(b,i,c)=>b>=0n&&i>=0n&&c>=0n&&b<=c&&i<=c-b;
 const max=(1n<<63n)-1n;
 for(const [b,i,c,want] of [[max,1n,max,false],[max,0n,max,true],[0n,max,max,true],[-1n,1n,3n,false],[2n,2n,3n,false]]) assert.equal(cap(b,i,c),want);
});
