// SOURCE-ONLY admission; no RTL codegen or simulation is performed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read = p => readFileSync(new URL('../'+p, import.meta.url), 'utf8');
const spec = JSON.parse(read('contracts/std-metrics-json-zorde-hdl-subset-v1.json'));
const metrics = read('stdlib/std/metrics_scalar.atto');
const zorde = read('stdlib/std/zorde_varuint31.atto');
const v = spec.scalar_reference_vectors;
test('HDL only stages explicit pure scalar Atto source; no dynamic guest claims', () => {
  assert.equal(spec.verification, 'SOURCE_ONLY_NOT_EXECUTED');
  assert.equal(spec.guest_evidence, null);
  for (const status of Object.values(spec.support_status)) assert.notEqual(status, 'PASS');
  for (const x of [metrics,zorde]) {
    assert.match(x, /define module \w+ as/);
    assert.doesNotMatch(x.replace(/\/\/[^\n]*/g,''), /rt fail|java:|HostInterop|process\.|stdio\./);
  }
  assert.match(metrics, /ceiling - current/);
  assert.match(zorde, /-value - 1/);
});
test('scalar counter/gauge/histogram reference never overflows', () => {
  const add = ({current,additional,ceiling}) =>
    current < 0 || additional < 0 || ceiling < 0 || ceiling > 2147483647 || current > ceiling ||
      additional > ceiling - current ? -1 : current + additional;
  for (const x of v.counter_add) assert.equal(add(x),x.result);
  for (const x of v.gauge_set) assert.equal(
    x.minimum <= x.maximum && x.value >= x.minimum && x.value <= x.maximum,x.result);
  const bucket = x =>
    x.sample < 0 || x.bound0 < 0 || x.bound1 <= x.bound0 ? -1 :
    x.sample <= x.bound0 ? 0 : x.sample <= x.bound1 ? 1 : 2;
  for (const x of v.histogram_bucket) assert.equal(bucket(x),x.result);
});
test('canonical scalar varuint31 lengths and signed zigzag31 endpoints', () => {
  const bytes = n => {
    if (n < 0 || n > 2147483647) return -1;
    let width = 1;
    while (n >= 128) { n = Math.floor(n / 128); width++; }
    return width;
  };
  for (const x of v.varuint31_octets) assert.equal(bytes(x.value),x.result);
  const zigzag = n => n < -1073741824 || n > 1073741823 ? -1 :
    n < 0 ? (-n-1)*2+1 : n*2;
  for (const x of v.zigzag31) assert.equal(zigzag(x.value),x.result);
});

test('counter ceiling above the signed-31 policy range is rejected by the reference',()=>{
 const bounded=(current,additional,ceiling)=>current<0||additional<0||ceiling<0||ceiling>2147483647||current>ceiling||additional>ceiling-current?-1:current+additional;
 assert.equal(bounded(0,0,2147483648),-1);
 assert.equal(bounded(2147483647,0,2147483647),2147483647);
 assert.equal(bounded(2147483647,1,2147483647),-1);
});

test('HDL scalar octet projection agrees with byte-identical portable varuint vectors (host reference)',()=>{
  const p=spec.portable_scalar_contract;
  const bytes=Buffer.from(read(p.path),'utf8');
  assert.equal(createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex'),p.git_blob_sha);
  assert.equal(p.git_blob_sha,'d6c42ddc36c1f404e7b8a6c0f2b65cfd637bd23b');
  assert.equal(p.execution,'SOURCE_ONLY_NOT_EXECUTED');
  const common=JSON.parse(bytes).zorde;
  const divisors=[1,128,16384,2097152,268435456];
  const octet=(value,slot)=>{
    if(!Number.isSafeInteger(value)||value<0||value>2147483647||!Number.isInteger(slot)||slot<0||slot>4)return -1;
    const width=divisors.filter(n=>value>=n).length||1;
    if(slot>=width)return -1;
    const digit=Math.floor(value/divisors[slot]);
    return digit-Math.floor(digit/128)*128+(slot<width-1?128:0);
  };
  for(const {value,wire} of common.valid_varuint31){
    assert.deepEqual(wire.map((_,i)=>octet(value,i)),wire);
    assert.equal(octet(value,wire.length),-1);
  }
  for(const n of [-1,2147483648,NaN,1.5])assert.equal(octet(n,0),-1);
  for(const i of [-1,5,1.5])assert.equal(octet(1,i),-1);
  for(const {value,wire} of common.signed_zigzag31){
    const mapped=value<0?(-value-1)*2+1:value*2;
    assert.deepEqual(wire.map((_,i)=>octet(mapped,i)),wire);
  }
  // Independent bitwise encoder: no shared quotient or width calculation.
  const encode=value=>{
    let n=BigInt(value);
    const wire=[];
    do {
      const low=Number(n&127n);
      n>>=7n;
      wire.push(low|(n===0n?0:128));
    } while(n!==0n);
    return wire;
  };
  const checkAllSlots=value=>{
    const wire=encode(value);
    for(let slot=-1;slot<=5;slot++)
      assert.equal(octet(value,slot),wire[slot]??-1);
  };
  for(const exp of [0,1,7,14,21,28,31])
    for(const off of [-2,-1,0,1,2]) {
      const n=2**exp+off;
      if(n>=0&&n<=2147483647)checkAllSlots(n);
    }
  let seed=0x12345678;
  for(let i=0;i<100000;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    checkAllSlots(seed&0x7fffffff);
  }
  assert.doesNotMatch(zorde.replace(/\/\/[^\n]*/g,''),/%/);
  assert.match(zorde,/digit - \(digit \/ 128\) \* 128/);
  assert.match(zorde,/pub fnc varuint31_octet_at/);
  assert.match(zorde,/slot >= width/);
  assert.equal(spec.support_status.zorde_varuint31_octet_scalar,'NOT_EXECUTED');
  for(const k of ['json_dynamic_value_tree','zorde_dynamic_frames','metrics_dynamic_snapshots'])assert.equal(spec.support_status[k],'CAPABILITY_REVIEW_REQUIRED');
});
