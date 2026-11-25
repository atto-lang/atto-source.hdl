import test from 'node:test';
import assert from 'node:assert/strict';
import {proveStaticBanking} from '../src/hardware-bank-proof.mjs';

// HDL cannot silently lower dynamic Option/ReadLoan: only static, proven
// addresses and physical bank budgets are admissible for this model.
const plan = (addresses) => ({
  target:'fpga', depth:16, bankCount:2,
  readPorts:2, writePorts:2, totalPorts:4,
  cycles:[addresses.map(address=>({address,kind:'read'}))]
});

test('static hardware array boundary addresses are exact and never wrap', () => {
  const p=proveStaticBanking(plan([0n,15n]));
  assert.equal(p.accessCount,2);
  assert.deepEqual(p.schedule[0].map(v=>v.bank),[0,1]);
  assert.deepEqual(p.schedule[0].map(v=>v.address),['0','15']);
  assert.ok(Object.isFrozen(p.schedule[0]));
  for (const bad of [-1n,-2n,16n,0xffff_ffffn,(1n<<63n)-1n,
    0, 15, NaN, Infinity, '0', null]) {
    assert.throws(()=>proveStaticBanking(plan([bad])), /out-of-bounds or non-static/);
  }
});

test('same-location read/write and write/write hazards reject even with enough ports', () => {
  for (const pair of [['read','write'],['write','write']]) {
    const c=plan([1n,1n]);
    c.cycles[0][0].kind=pair[0];
    c.cycles[0][1].kind=pair[1];
    assert.throws(()=>proveStaticBanking(c), /same-address/);
  }
  const reads=plan([1n,1n]);
  assert.equal(proveStaticBanking(reads).accessCount,2);
});

test('narrow port budgets cannot disguise conflicts with disjoint addresses', () => {
  const c=plan([0n,2n]); // Two addresses map to bank zero.
  c.readPorts=1;
  assert.throws(()=>proveStaticBanking(c),/memory bank port conflict/);
  c.readPorts=2;
  assert.equal(proveStaticBanking(c).schedule[0].length,2);
});

test('missing or empty dynamic collection shape cannot invent a bank', () => {
  const c=plan([0n]);
  c.cycles[0][0].address=undefined;
  assert.throws(()=>proveStaticBanking(c), /out-of-bounds or non-static/);
  const zero=plan([]);
  assert.equal(proveStaticBanking(zero).accessCount,0);
  assert.deepEqual(proveStaticBanking(zero).schedule[0],[]);
});
