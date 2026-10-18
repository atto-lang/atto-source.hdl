import test from 'node:test';
import assert from 'node:assert/strict';
import {proveBoundedCounter,proveNarrowArithmetic} from '../src/hardware-width-proof.mjs';
const bounded=(n)=>proveBoundedCounter({target:'fpga',referenceBits:64,maxInclusive:BigInt(n)});
test('minimal counter widths include terminal bound and never truncate',()=>{
  assert.equal(bounded(0).resultBits,1);
  assert.equal(bounded(1).resultBits,1);
  assert.equal(bounded(100).resultBits,7);
  assert.equal(bounded(255).resultBits,8);
  assert.equal(bounded(256).resultBits,9);
  assert.throws(()=>proveBoundedCounter({target:'asic',referenceBits:7,maxInclusive:128n}),/exceeds/);
});
test('negative/adversarial hardware width requests are rejected',()=>{
  assert.throws(()=>proveBoundedCounter({target:'cpu',referenceBits:64,maxInclusive:3n}),/hardware target/);
  assert.throws(()=>proveBoundedCounter({target:'fpga',referenceBits:64,maxInclusive:-1n}),/static/);
  assert.throws(()=>proveBoundedCounter({target:'fpga',referenceBits:64,maxInclusive:3}),/static/);
  assert.throws(()=>proveNarrowArithmetic({target:'fpga',operation:'add',left:{min:0n,max:1n},right:{min:1n,max:1n},referenceBits:64}),/signedness/);
  assert.throws(()=>proveNarrowArithmetic({target:'fpga',operation:'mul',left:{min:0n,max:16n},right:{min:16n,max:16n},referenceBits:8,signed:false}),/overflow/);
  assert.throws(()=>proveNarrowArithmetic({target:'fpga',operation:'sub',left:{min:0n,max:0n},right:{min:1n,max:1n},referenceBits:8,signed:false}),/overflow/);
  assert.throws(()=>proveNarrowArithmetic({target:'fpga',operation:'add',left:{min:0n,max:1n},right:{min:1n,max:1n},referenceBits:0,signed:false}),/reference bits/);
  assert.throws(()=>proveNarrowArithmetic({target:'fpga',operation:'add',left:{min:0n,max:1n},right:{min:0n,max:1n,other:2n},referenceBits:64,signed:false}),/exact finite/);
});
test('signed extrema preserve exact interval and width',()=>{
  const r=proveNarrowArithmetic({target:'asic',operation:'mul',left:{min:-10n,max:3n},
    right:{min:-2n,max:4n},signed:true,referenceBits:16});
  assert.deepEqual(r.range,{min:'-40',max:'20'});
  assert.equal(r.resultBits,7);
});
test('unsigned arithmetic exhaustive 1..8-bit no-overflow differential',()=>{
  let checked=0,rejected=0;
  for(let bits=1;bits<=8;bits++){
    const max=(1<<bits)-1;
    for(let x=0;x<=max;x++)for(let y=0;y<=max;y++){
      for(const [operation,expected] of [['add',x+y],['sub',x-y],['mul',x*y]]){
        const cfg={target:'fpga',operation,left:{min:BigInt(x),max:BigInt(x)},
          right:{min:BigInt(y),max:BigInt(y)},signed:false,referenceBits:bits};
        if(expected<0||expected>max){
          assert.throws(()=>proveNarrowArithmetic(cfg));rejected++;continue;
        }
        const p=proveNarrowArithmetic(cfg);checked++;
        assert.equal(BigInt(p.range.min),BigInt(expected));
        assert.equal(BigInt(p.range.max),BigInt(expected));
        assert.ok(BigInt(expected) <= (1n<<BigInt(p.resultBits))-1n);
        if(p.resultBits>1)assert.ok(BigInt(expected) >= (1n<<BigInt(p.resultBits-1)));
      }
    }
  }
  assert.ok(checked>10000 && rejected>10000);
});
test('signed arithmetic exhaustive 1..6-bit no-overflow differential',()=>{
  let checked=0;
  for(let bits=1;bits<=6;bits++){
    const min=-(1<<(bits-1)),max=(1<<(bits-1))-1;
    for(let x=min;x<=max;x++)for(let y=min;y<=max;y++){
      for(const [operation,expected] of [['add',x+y],['sub',x-y],['mul',x*y]]){
        const cfg={target:'asic',operation,left:{min:BigInt(x),max:BigInt(x)},
          right:{min:BigInt(y),max:BigInt(y)},signed:true,referenceBits:bits};
        if(expected<min||expected>max){assert.throws(()=>proveNarrowArithmetic(cfg));continue;}
        const p=proveNarrowArithmetic(cfg);checked++;
        assert.equal(BigInt(p.range.min),BigInt(expected));
        assert.equal(BigInt(p.range.max),BigInt(expected));
        const smallest=-(1n<<BigInt(p.resultBits-1));
        const largest=(1n<<BigInt(p.resultBits-1))-1n;
        assert.ok(BigInt(expected)>=smallest && BigInt(expected)<=largest);
      }
    }
  }
  assert.ok(checked>1000);
});
