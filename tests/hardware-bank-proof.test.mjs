import test from 'node:test';
import assert from 'node:assert/strict';
import {proveStaticBanking} from '../src/hardware-bank-proof.mjs';
const base=(overrides={})=>({target:'fpga',depth:16,bankCount:2,readPorts:1,
  writePorts:1,totalPorts:2,cycles:[[{address:0n,kind:'read'},{address:1n,kind:'write'}]],
  ...overrides});
test('static 2-bank independent accesses preserve order',()=>{
  const r=proveStaticBanking(base());
  assert.equal(r.accessCount,2);
  assert.deepEqual(r.schedule[0].map(a=>a.bank),[0,1]);
  assert.equal(r.proof.includes('no RTL'),true);
});
test('memory same-bank port oversubscription rejects',()=>{
  assert.throws(()=>proveStaticBanking(base({cycles:[[
    {address:0n,kind:'read'},{address:2n,kind:'read'}]]})),/port conflict/);
});
test('total-port budget cannot be bypassed by separate read/write counters',()=>{
  assert.throws(()=>proveStaticBanking(base({bankCount:1,totalPorts:1,cycles:[[
    {address:0n,kind:'read'},{address:1n,kind:'write'}]]})),/port conflict/);
});
test('same-address hazards fail closed even with spare physical ports',()=>{
  for(const kinds of [['read','write'],['write','read'],['write','write']]){
    assert.throws(()=>proveStaticBanking(base({readPorts:2,writePorts:2,totalPorts:4,
      cycles:[kinds.map(kind=>({kind,address:0n}))]})),/hazard/);
  }
  assert.equal(proveStaticBanking(base({readPorts:2,totalPorts:2,
    cycles:[[{address:0n,kind:'read'},{address:0n,kind:'read'}]]})).accessCount,2);
});
test('bounded and static address admission rejects unknowns',()=>{
  for(const a of [
    {address:-1n,kind:'read'},
    {address:16n,kind:'read'},
    {address:1,kind:'read'},
    {address:0n,kind:'read',pointer:'guest'},
    {address:1n,kind:'atomic'}
  ])assert.throws(()=>proveStaticBanking(base({cycles:[[a]]})),/rejected/);
  assert.throws(()=>proveStaticBanking(base({target:'llvm'})),/target/);
  assert.throws(()=>proveStaticBanking(base({depth:0})),/depth/);
  assert.throws(()=>proveStaticBanking(base({bankCount:17})),/depth/);
  assert.throws(()=>proveStaticBanking(base({cycles:new Array(1025).fill([])})),/bounded/);
});
test('exhaustive 1..4 bank mapping and conflict oracle on small addresses',()=>{
  for(const banks of [1,2,4])for(let a=0;a<16;a++)for(let b=0;b<16;b++){
    const pair=[{address:BigInt(a),kind:'read'},
      {address:BigInt(b),kind:'read'}];
    const cfg=base({bankCount:banks,readPorts:2,writePorts:0,totalPorts:2,cycles:[pair]});
    const got=proveStaticBanking(cfg);
    assert.deepEqual(got.schedule[0].map(x=>x.bank),[a%banks,b%banks]);
    const forbidden=base({bankCount:banks,readPorts:1,writePorts:0,totalPorts:1,cycles:[pair]});
    if(a%banks===b%banks)assert.throws(()=>proveStaticBanking(forbidden),/port conflict/);
    else assert.equal(proveStaticBanking(forbidden).accessCount,2);
  }
});
