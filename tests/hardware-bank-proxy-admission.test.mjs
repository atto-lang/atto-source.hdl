import test from 'node:test';
import assert from 'node:assert/strict';
import {proveStaticBanking} from '../src/hardware-bank-proof.mjs';
const base=()=>({target:'fpga',depth:16,bankCount:2,readPorts:1,
  writePorts:1,totalPorts:2,cycles:[[{address:0n,kind:'read'}]]});
test('top-level Proxy is rejected without calling its getters or traps',()=>{
  let reads=0;
  const p=new Proxy(base(),{get(t,k){reads++;return Reflect.get(t,k);}});
  assert.throws(()=>proveStaticBanking(p),/plain record/);
  assert.equal(reads,0);
});
test('nested access Proxy denied without invoking getters',()=>{
  const c=base();let reads=0;
  c.cycles[0][0]=new Proxy(c.cycles[0][0],{get(t,k){reads++;return Reflect.get(t,k);}});
  assert.throws(()=>proveStaticBanking(c),/only static exact/);
  assert.equal(reads,0);
});
test('cycle and access arrays wrapped in Proxies are denied before iteration',()=>{
  for(const selector of [c=>c.cycles,c=>c.cycles[0]]){
    const c=base();let reads=0;
    if(selector(c)===c.cycles)c.cycles=new Proxy(c.cycles,{
      get(t,k){reads++;return Reflect.get(t,k);}});
    else c.cycles[0]=new Proxy(c.cycles[0],{
      get(t,k){reads++;return Reflect.get(t,k);}});
    assert.throws(()=>proveStaticBanking(c),/bounded ordinary array/);
    assert.equal(reads,0);
  }
});
test('revoked proxies reject without invoking any traps',()=>{
  const c=base(),p=Proxy.revocable(c.cycles[0][0],{});
  p.revoke();c.cycles[0][0]=p.proxy;
  assert.throws(()=>proveStaticBanking(c),/only static exact/);
  const q=Proxy.revocable(base(),{});q.revoke();
  assert.throws(()=>proveStaticBanking(q.proxy),/plain record/);
});
