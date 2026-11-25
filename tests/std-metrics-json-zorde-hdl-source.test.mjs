// SOURCE-ONLY admission; no RTL codegen or simulation is performed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
