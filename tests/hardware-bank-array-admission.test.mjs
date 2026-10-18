import test from 'node:test';
import assert from 'node:assert/strict';
import {proveStaticBanking} from '../src/hardware-bank-proof.mjs';

const config = () => ({target:'fpga',depth:16,bankCount:2,readPorts:2,
  writePorts:1,totalPorts:2,cycles:[[
    {address:0n,kind:'read'},{address:1n,kind:'write'}]]});

test('configuration property getter is rejected without executing it',()=>{
  const c=config();let calls=0;
  Object.defineProperty(c,'cycles',{enumerable:true,get(){calls++;return [];}});
  assert.throws(()=>proveStaticBanking(c),/exact own data properties/);
  assert.equal(calls,0);
});
test('unexpected configuration keys and symbols deny instead of being ignored',()=>{
  const c=config();c.runtimeUnsafe=true;
  assert.throws(()=>proveStaticBanking(c),/exact own data properties/);
  const c2=config();c2[Symbol('unsafe')]=1;
  assert.throws(()=>proveStaticBanking(c2),/exact own data properties/);
});
test('cycle array getters are rejected without invoking them',()=>{
  const c=config();let calls=0;
  Object.defineProperty(c.cycles,'0',{configurable:true,enumerable:true,
    get(){calls++;return [];}});
  assert.throws(()=>proveStaticBanking(c),/dense own data elements/);
  assert.equal(calls,0);
});
test('access array getters are rejected without invoking them',()=>{
  const c=config();let calls=0;
  Object.defineProperty(c.cycles[0],'1',{configurable:true,enumerable:true,
    get(){calls++;return {address:1n,kind:'write'};}});
  assert.throws(()=>proveStaticBanking(c),/dense own data elements/);
  assert.equal(calls,0);
});
test('sparse cycle and sparse access arrays are rejected',()=>{
  const c=config();delete c.cycles[0];
  assert.throws(()=>proveStaticBanking(c),/dense/);
  const d=config();delete d.cycles[0][0];
  assert.throws(()=>proveStaticBanking(d),/dense/);
});
test('array metadata, symbol tags and nonstandard prototypes deny',()=>{
  const c=config();c.cycles.extras='untested';
  assert.throws(()=>proveStaticBanking(c),/no extra properties/);
  const d=config();d.cycles[0][Symbol('data')]=1;
  assert.throws(()=>proveStaticBanking(d),/no extra properties/);
  const e=config();Object.setPrototypeOf(e.cycles[0],[]);
  assert.throws(()=>proveStaticBanking(e),/bounded ordinary array/);
});
test('valid dense arrays remain accepted and cannot mutate returned plan',()=>{
  const c=config(), p=proveStaticBanking(c);
  assert.equal(p.accessCount,2);
  assert.deepEqual(p.schedule[0].map(x=>x.bank),[0,1]);
  c.cycles[0][0].address=6n;
  assert.equal(p.schedule[0][0].address,'0');
  assert.throws(()=>{p.schedule[0][0].bank=5;},TypeError);
});
