import test from 'node:test';
import assert from 'node:assert/strict';
import {proveBoundedCounter, proveNarrowArithmetic} from '../src/hardware-width-proof.mjs';

const counter=()=>({target:'fpga',referenceBits:16,maxInclusive:42n});
const arithmetic=()=>({target:'asic',operation:'add',left:{min:2n,max:4n},
  right:{min:3n,max:5n},signed:false,referenceBits:16});

test('top-level counter and arithmetic accessors never execute',()=>{
  for(const [make,run,key] of [[counter,proveBoundedCounter,'maxInclusive'],
    [arithmetic,proveNarrowArithmetic,'left']]){
    let invoked=0;
    const input=make();
    Object.defineProperty(input,key,{enumerable:true,get(){
      invoked++;throw Error('unsafe hardware getter executed');
    }});
    assert.throws(()=>run(input),/exact own data properties/);
    assert.equal(invoked,0);
  }
});

test('proxy configurations and ranges are rejected before any trap executes',()=>{
  for(const [make,run] of [[counter,proveBoundedCounter],[arithmetic,proveNarrowArithmetic]]){
    let trapped=0;
    const hostile=new Proxy(make(),{
      get(){trapped++;throw Error('get trap ran');},
      getPrototypeOf(){trapped++;throw Error('prototype trap ran');},
      ownKeys(){trapped++;throw Error('ownKeys trap ran');}
    });
    assert.throws(()=>run(hostile),/plain data record/);
    assert.equal(trapped,0);
  }
  let trapped=0;
  const range=new Proxy({min:0n,max:1n},{
    getPrototypeOf(){trapped++;throw Error('range prototype trap ran');},
    ownKeys(){trapped++;throw Error('range ownKeys trap ran');}
  });
  assert.throws(()=>proveNarrowArithmetic({...arithmetic(),left:range}),/exact finite bigint range/);
  assert.equal(trapped,0);
});

test('top-level extras, symbols, inherited fields and array inputs fail closed',()=>{
  const extra={...counter(),unknown:'unexpected'};
  assert.throws(()=>proveBoundedCounter(extra),/exact own data/);
  const symbol=arithmetic();symbol[Symbol('hidden')]=true;
  assert.throws(()=>proveNarrowArithmetic(symbol),/exact own data/);
  const inherited=Object.assign(Object.create(counter()),{});
  assert.throws(()=>proveBoundedCounter(inherited),/plain data record/);
  assert.throws(()=>proveBoundedCounter([]),/plain data record/);
});

test('null-prototype plain record inputs preserve the numerical certificate',()=>{
  const c=Object.assign(Object.create(null),counter());
  assert.equal(proveBoundedCounter(c).resultBits,6);
  const a=Object.assign(Object.create(null),arithmetic());
  a.left=Object.assign(Object.create(null),a.left);
  assert.deepEqual(proveNarrowArithmetic(a).range,{min:'5',max:'9'});
});

test('top-level snapshots separate proof from subsequent caller mutation',()=>{
  const c=counter(),a=arithmetic();
  const cResult=proveBoundedCounter(c),aResult=proveNarrowArithmetic(a);
  c.maxInclusive=65535n;a.left.max=65535n;a.operation='mul';
  assert.equal(cResult.resultBits,6);
  assert.deepEqual(aResult.range,{min:'5',max:'9'});
  assert.ok(Object.isFrozen(cResult)&&Object.isFrozen(aResult));
});
