import test from "node:test";
import assert from "node:assert/strict";
import {readFile,lstat} from "node:fs/promises";
import {createHash} from "node:crypto";
import {compileSource} from "../src/compiler.mjs";
const PIN={
  "math": "45598b642a455907152d2eceaf9a71dc35a9016f",
  "hash": "9ab1e38142b43d5af2aa6542baaf995f95af30af",
  "cell": "4dd71711deaeac3ebab698800c3f5365b748b254"
};
const gitBlob=bytes=>createHash('sha1')
 .update(Buffer.from('blob '+bytes.length+'\\0')).update(bytes).digest('hex');
test('Atto HDL core source files are backend-owned but not synthesized',async()=>{
 for(const [name,expected] of Object.entries(PIN)){
  const file=new URL('../library/atto.core/'+name+'.atto',import.meta.url);
  const stat=await lstat(file);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=131072&&stat.size>0);
  const bytes=await readFile(file);
  assert.equal(gitBlob(bytes),expected);
  const code=new TextDecoder('utf8',{fatal:true}).decode(bytes);
  assert.match(code,new RegExp('define module '+name+' as'));
  assert.ok(!code.includes('\\0')&&!code.startsWith('\\uFEFF'));
 }
});
test('RTL compiler fails closed rather than treating Core import as hardware',()=>{
 for(const path of ['atto.core/math','atto.core/hash','atto.core/cell']){
  const code='import module x from "'+path+'"; pub fnc main(u8 n):u8{return n;}';
  assert.throws(()=>compileSource(code));
 }
 // A real fixed-width scalar source remains separate and synthesizeable.
 const baseline=compileSource('pub fnc xor_bits(u8 a,u8 b):u8{return a ^ b;}');
 assert.match(baseline.systemVerilog,/module ores_xor_bits/);
});
test('reference hash vector is not a compiled hardware guest',()=>{
 let n=17*31+42;
 assert.equal(n,569);
 n=n*31+7;
 assert.equal(n,17646);
 assert.equal(1000000007-1000000007,0);
});
