import test from 'node:test';
import assert from 'node:assert/strict';
import {proveBoundedCounter,proveNarrowArithmetic} from '../src/hardware-width-proof.mjs';
import {proveStaticBanking} from '../src/hardware-bank-proof.mjs';

const bank=(access)=>proveStaticBanking({target:'fpga',depth:32,bankCount:2,
  readPorts:1,writePorts:1,totalPorts:2,cycles:[[access]]});
const add=(left,right)=>proveNarrowArithmetic({target:'fpga',operation:'add',
  signed:false,referenceBits:16,left,right});

test('bank proof does not invoke attacker-controlled address getter',()=>{
  let invoked=0;
  const access={kind:'read'};
  Object.defineProperty(access,'address',{enumerable:true,get(){invoked++;return 0n;}});
  assert.throws(()=>bank(access),/accessor-backed memory access not admitted/);
  assert.equal(invoked,0);
});
test('bank proof does not invoke attacker-controlled kind getter',()=>{
  let invoked=0;
  const access={address:0n};
  Object.defineProperty(access,'kind',{enumerable:true,get(){invoked++;return 'read';}});
  assert.throws(()=>bank(access),/accessor-backed memory access not admitted/);
  assert.equal(invoked,0);
});
test('bank proof rejects inherited or forged fields without reading the prototype',()=>{
  const inherited=Object.create({address:0n});
  inherited.kind='read';
  assert.throws(()=>bank(inherited),/only static exact/);
  const nullPrototype=Object.create(null);
  nullPrototype.kind='read';nullPrototype.address=1n;
  assert.equal(bank(nullPrototype).schedule[0][0].bank,1);
});
test('arithmetic proof does not invoke side-effecting range getters',()=>{
  let invoked=0;
  const range={max:4n};
  Object.defineProperty(range,'min',{enumerable:true,get(){invoked++;return 1n;}});
  assert.throws(()=>add(range,{min:1n,max:2n}),/stable own bigint data/);
  assert.equal(invoked,0);
});
test('range proof requires only data properties and rejects foreign prototype',()=>{
  const foreign=Object.create({min:0n});foreign.max=1n;
  assert.throws(()=>add(foreign,{min:1n,max:2n}),/exact finite bigint/);
  const nullPrototype=Object.assign(Object.create(null),{min:0n,max:3n});
  assert.deepEqual(add(nullPrototype,{min:2n,max:4n}).range,{min:'2',max:'7'});
});
test('nested proof intervals and schedule entries cannot be rewritten',()=>{
  const counter=proveBoundedCounter({target:'asic',referenceBits:64,maxInclusive:100n});
  assert.ok(Object.isFrozen(counter) && Object.isFrozen(counter.range));
  assert.throws(()=>{counter.range.max='200';},TypeError);
  const left={min:0n,max:4n},right={min:1n,max:3n};
  const proven=add(left,right);
  left.max=65535n;
  assert.deepEqual(proven.range,{min:'1',max:'7'});
  assert.ok(Object.isFrozen(proven.range));
  assert.throws(()=>{proven.range.min='-1';},TypeError);
  const scheduled=bank({kind:'write',address:2n});
  assert.ok(Object.isFrozen(scheduled.schedule) &&
    Object.isFrozen(scheduled.schedule[0]) &&
    Object.isFrozen(scheduled.schedule[0][0]));
  assert.throws(()=>{scheduled.schedule[0][0].bank=99;},TypeError);
});
