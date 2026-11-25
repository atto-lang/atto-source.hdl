import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const perf=readFileSync(new URL('../stdlib/perf.atto',import.meta.url),'utf8');
const ids=readFileSync(new URL('../stdlib/perf_ids.atto',import.meta.url),'utf8');
const slots=readFileSync(new URL('../stdlib/perf_counter_slots.atto',import.meta.url),'utf8');
test('HDL uses explicit cycle-domain snapshots rather than a CPU clock',()=>{
 assert.match(perf,/begin_cycles\(bool enabled, int current_cycle\)/);
 assert.match(perf,/duration_cycles\(bool enabled, int begin_cycle, int end_cycle\)/);
 assert.doesNotMatch(perf,/process\.|monotonic_ns|new |Array|stdio\.|spawn|await /);
 assert.match(perf,/end_cycle < begin_cycle/);
});
test('bounded hardware counter admission and saturating drops',()=>{
 assert.match(slots,/capacity >= 1 && capacity <= 65536/);
 assert.match(slots,/occupied >= 0 && occupied < capacity/);
 assert.match(slots,/dropped >= 2147483647/);
 assert.doesNotMatch(slots,/new |Array|malloc|process\.|stdio\./);
});
test('no renumbering of static cross-backend probe IDs',()=>{
 const rows=[...ids.matchAll(/return (\d+);/g)].map(x=>Number(x[1]));
 assert.deepEqual(rows,[23,24,25,26,27,28,29]);
});
