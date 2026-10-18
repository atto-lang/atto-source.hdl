import test from 'node:test';
import assert from 'node:assert/strict';
import {proveBoundedCounter,proveNarrowArithmetic} from '../src/hardware-width-proof.mjs';

const counter=()=>({target:'fpga',referenceBits:16,maxInclusive:255n});
const arithmetic=()=>({target:'fpga',operation:'add',signed:false,
  referenceBits:16,left:{min:0n,max:4n},right:{min:0n,max:5n}});

test('top-level counter getter denied before invocation',()=>{
  let called=0;const options=counter();
  Object.defineProperty(options,'maxInclusive',{enumerable:true,get(){called++;return 5n;}});
  assert.throws(()=>proveBoundedCounter(options),/own data properties/);
  assert.equal(called,0);
});
test('top-level arithmetic getter denied before invocation',()=>{
  let called=0;const options=arithmetic();
  Object.defineProperty(options,'right',{enumerable:true,get(){called++;return {min:0n,max:1n};}});
  assert.throws(()=>proveNarrowArithmetic(options),/own data properties/);
  assert.equal(called,0);
});
test('hostile and revoked Proxies cannot invoke traps',()=>{
  let traps=0;
  const hostile=new Proxy(arithmetic(),{get(t,k){traps++;return Reflect.get(t,k);}});
  assert.throws(()=>proveNarrowArithmetic(hostile),/plain data record/);
  const revoked=Proxy.revocable(counter(),{});revoked.revoke();
  assert.throws(()=>proveBoundedCounter(revoked.proxy),/plain data record/);
  const range=Proxy.revocable({min:0n,max:1n},{});range.revoke();
  const cfg=arithmetic();cfg.left=range.proxy;
  assert.throws(()=>proveNarrowArithmetic(cfg),/exact finite bigint range/);
  assert.equal(traps,0);
});
test('symbol metadata and inherited fields are rejected',()=>{
  const extra=counter();extra[Symbol('shadow')]=0;
  assert.throws(()=>proveBoundedCounter(extra),/own data properties/);
  const inherited=Object.create({target:'fpga'});inherited.referenceBits=16;inherited.maxInclusive=10n;
  assert.throws(()=>proveBoundedCounter(inherited),/plain data record/);
  const cfg=arithmetic();cfg.left[Symbol('spoof')]=0;
  assert.throws(()=>proveNarrowArithmetic(cfg),/exact finite bigint range/);
});
test('genuine null-prototype records retain valid semantics and frozen results',()=>{
  const opts=Object.assign(Object.create(null),counter());
  const proof=proveBoundedCounter(opts);
  assert.equal(proof.resultBits,8);
  assert.ok(Object.isFrozen(proof) && Object.isFrozen(proof.range));
  const ar=arithmetic();ar.right=Object.assign(Object.create(null),ar.right);
  assert.deepEqual(proveNarrowArithmetic(ar).range,{min:'0',max:'9'});
});

test('two incorrect range keys produce controlled rejection rather than TypeError',()=>{
  const cfg=arithmetic();cfg.left={one:0n,two:1n};
  assert.throws(()=>proveNarrowArithmetic(cfg),RangeError);
  const malformed=Object.create(null);
  malformed.min=0n;malformed[Symbol('max')]=1n;
  cfg.left=malformed;
  assert.throws(()=>proveNarrowArithmetic(cfg),RangeError);
});
