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

test('deterministic multi-cycle differential stress matches independent port oracle',()=>{
  let seed=0x5eeda11;
  const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  const admissible=(cycles,banks,rd,wr,total)=>{
    for(const accesses of cycles){
      const uses=Array.from({length:banks},()=>({read:0,write:0}));
      const cell=new Map();
      for(const a of accesses){
        const address=Number(a.address),bank=address%banks;
        const t=uses[bank];t[a.kind]++;
        if(t.read>rd||t.write>wr||t.read+t.write>total)return false;
        const previous=cell.get(address);
        if(previous && (previous==='write'||a.kind==='write'))return false;
        cell.set(address,a.kind);
      }
    }
    return true;
  };
  for(let round=0;round<10000;round++){
    const banks=[1,2,4][rand()%3],rd=rand()%3,wr=rand()%3,total=1+rand()%4;
    const cycles=Array.from({length:1+rand()%3},()=>Array.from({length:rand()%7},
      ()=>({address:BigInt(rand()%16),kind:(rand()%2?'read':'write')})));
    const config=base({bankCount:banks,readPorts:rd,writePorts:wr,totalPorts:total,cycles});
    const expected=admissible(cycles,banks,rd,wr,total);
    // A configuration without *any* available physical read or write port
    // is invalid even for empty cycles; match the proof's admission rule.
    if(rd+wr===0||!expected)assert.throws(()=>proveStaticBanking(config));
    else{
      const result=proveStaticBanking(config);
      assert.equal(result.accessCount,cycles.reduce((n,x)=>n+x.length,0));
      assert.equal(result.cycles,cycles.length);
    }
  }
});
