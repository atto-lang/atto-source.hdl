import test from 'node:test';
import assert from 'node:assert/strict';
import {proveStaticBanking} from '../src/hardware-bank-proof.mjs';
const model=(cycles,banks,rd,wr,total)=>{
  for(const as of cycles){
    const counts=Array.from({length:banks},()=>({read:0,write:0}));
    const seen=new Map();
    for(const a of as){
      const address=Number(a.address),bucket=address%banks;
      const entry=counts[bucket];entry[a.kind]++;
      if(entry.read>rd||entry.write>wr||entry.read+entry.write>total)return false;
      if(seen.has(address) && (seen.get(address)==='write'||a.kind==='write'))return false;
      seen.set(address,a.kind);
    }
  }
  return true;
};
test('20,000 deterministic static schedules match independent bank and hazard oracle',()=>{
  let seed=0x937b24;
  const rand=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
  let admitted=0,rejected=0;
  for(let i=0;i<20000;i++){
    const bankCount=[1,2,3,4,8][rand()%5], readPorts=rand()%3, writePorts=rand()%3,totalPorts=1+rand()%4;
    const cycles=Array.from({length:1+rand()%4},()=>Array.from({length:rand()%8},()=>({address:BigInt(rand()%32),kind:rand()%2?'read':'write'})));
    const cfg={target:'fpga',depth:32,bankCount,readPorts,writePorts,totalPorts,cycles};
    if(readPorts+writePorts===0||!model(cycles,bankCount,readPorts,writePorts,totalPorts)){
      assert.throws(()=>proveStaticBanking(cfg));rejected++;
    } else {
      const result=proveStaticBanking(cfg);admitted++;
      assert.equal(result.accessCount,cycles.reduce((n,x)=>n+x.length,0));
      assert.deepEqual(result.schedule.map(x=>x.map(y=>y.bank)),cycles.map(x=>x.map(y=>Number(y.address%BigInt(bankCount)))));
    }
  }
  assert.ok(admitted>100 && rejected>100);
});
