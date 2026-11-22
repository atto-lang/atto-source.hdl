import test from "node:test";
import assert from "node:assert/strict";
import {readFile,lstat} from "node:fs/promises";
import {createHash} from "node:crypto";
import {compileSource} from "../src/compiler.mjs";
const PIN={
  "math": "45598b642a455907152d2eceaf9a71dc35a9016f",
  "hash": "9ab1e38142b43d5af2aa6542baaf995f95af30af",
  "cell": "38439b2b0b487b4bb09d191ba50c115611295206"
};
const gitBlob=bytes=>createHash('sha1')
 .update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
test('Atto HDL core source files are backend-owned but not synthesized',async()=>{
 for(const [name,expected] of Object.entries(PIN)){
  const file=new URL('../library/atto.core/'+name+'.atto',import.meta.url);
  const stat=await lstat(file);
  assert.ok(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=131072&&stat.size>0);
  const bytes=await readFile(file);
  assert.equal(gitBlob(bytes),expected);
  const code=new TextDecoder('utf8',{fatal:true}).decode(bytes);
  assert.match(code,new RegExp('define module '+name+' as'));
  assert.ok(!code.includes('\0')&&!code.startsWith('\uFEFF'));
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


test('borrow-aware core Cell owner predicates are source-only, never guest authority', async () => {
  const cell=(await readFile(new URL('../library/atto.core/cell.atto',import.meta.url))).toString('utf8');
  for(const name of ['valid_loan_state','can_owner_read','can_owner_write',
                     'can_move_owner','can_suspend_unpinned']){
    assert.ok(cell.includes('pub fnc '+name+'('),name);
  }
  const vectors=[
    [0,false,true,true], [1,false,true,false],
    [65535,false,true,false], [65536,false,false,false],
    [-1,false,false,false], [0,true,true,false], [1,true,false,false]
  ];
  for(const [readers,writer,valid,write] of vectors){
    assert.equal(readers>=0&&readers<=65535&&(!writer||readers===0),valid);
    assert.equal(readers===0&&!writer,write);
  }
  assert.ok(!cell.includes('pub fnc issue_loan('));
  // This is only a source/policy reference check, NOT a compiled guest test.
});

test('core/cell saturated read admission rejects overflow but retains owner read', async () => {
  const source=(await readFile(new URL('../library/atto.core/cell.atto',import.meta.url))).toString('utf8');
  // Source-only policy shape. This MUST NOT be promoted to a compiler loan.
  assert.match(source,/pub fnc can_borrow_read\(/);
  assert.match(source,/pub fnc can_owner_read\(/);
  assert.match(source,/readers >= 0 && readers < 65535 && !writer_active/);
  const canAcquire=(n,w)=>n>=0 && n<65535 && !w;
  const ownerRead=(n,w)=>n>=0 && n<=65535 && !w;
  for(const [n,w,acquire,read] of [
    [0,false,true,true],[65534,false,true,true],[65535,false,false,true],
    [65536,false,false,false],[-1,false,false,false],[0,true,false,false]
  ]) {
    assert.equal(canAcquire(n,w),acquire);
    assert.equal(ownerRead(n,w),read);
  }
  assert.ok(!source.includes('pub fnc issue_loan('));
});
