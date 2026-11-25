import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../core/perf_policy.atto',import.meta.url),'utf8');
const code=source.replace(/\/\/[^\n]*/g,'');
const body=(start,end)=>code.split('pub fnc '+start)[1]?.split('pub fnc '+end)[0]??'';
test('five public pure Atto core policies are independently compiled candidates',()=>{
 assert.match(code,/define module core as/);
 for(const name of ['perf_valid_probe','perf_should_sample','perf_duration_ns','perf_can_record','perf_next_dropped'])
  assert.match(code,new RegExp('pub fnc '+name+'\\('));
});
test('no runtime capability, allocation or clock effect is present',()=>{
 assert.doesNotMatch(code,/process\.|stdio\.|import |malloc|new Array|\bnew\b|eval\(|spawn|await |thread/);
});
test('sampling rejects zero divisors then performs overflow-safe integer math',()=>{
 const sample=body('perf_should_sample','perf_duration_ns');
 assert.match(sample,/every_n < 1 \|\| every_n > 65536/);
 assert.ok(sample.indexOf('every_n < 1')<sample.indexOf('sample_key / every_n'));
 assert.match(sample,/\(sample_key \/ every_n\) \* every_n == sample_key/);
 assert.doesNotMatch(sample,/%/);
});
test('full/disabled buffers never record and count saturates',()=>{
 const cap=body('perf_can_record','perf_next_dropped');
 assert.match(cap,/!enabled/);
 assert.match(cap,/capacity < 1 \|\| capacity > 65536/);
 assert.match(cap,/occupied >= 0 && occupied < capacity/);
 const drop=code.split('pub fnc perf_next_dropped')[1];
 assert.match(drop,/dropped >= 2147483647/);
 assert.match(drop,/return dropped \+ 1/);
});
test('elapsed monotonic rollback clamps to zero and cannot overflow',()=>{
 const elapsed=body('perf_duration_ns','perf_can_record');
 assert.match(elapsed,/started_ns <= 0 \|\| finished_ns < started_ns/);
 assert.match(elapsed,/finished_ns - started_ns/);
});

test('bounded perf policies match independent integer boundary oracle (source model only)',()=>{
 const js=code.replace(/^\s*define module core as\s*$/m,'').replace(/^\s*end\s*$/m,'')
   .replace(/pub fnc (\w+)\(([^)]*)\): (?:int|bool) \{/g,(_,name,args)=>'function '+name+'('+args.split(',').map(x=>x.trim().split(/\s+/).at(-1)).join(',')+') {')
   .replace(/\bif ([^\n]+?) then/g,(_,condition)=>'if ('+condition+') {')
   .replace(/\bfi\b/g,'}').replace(/(?<![\w])\d+(?![\w])/g,x=>x+'n');
 const model=new Function(js+'\nreturn {perf_valid_probe,perf_should_sample,perf_duration_ns,perf_can_record,perf_next_dropped};')();
 const values=[-1n,0n,1n,2n,65535n,65536n,65537n,2147483646n,2147483647n,9223372036854775807n];
 for(const x of values){
   assert.equal(model.perf_valid_probe(x),x>=1n&&x<=2147483647n);
   assert.equal(model.perf_next_dropped(x),x<0n?0n:x>=2147483647n?2147483647n:x+1n);
   for(const y of values){
     assert.equal(model.perf_should_sample(x,y),x>=0n&&y>=1n&&y<=65536n&&x%y===0n);
     assert.equal(model.perf_duration_ns(x,y),x>0n&&y>=x?y-x:0n);
     for(const enabled of [false,true]) assert.equal(model.perf_can_record(enabled,x,y),enabled&&y>=1n&&y<=65536n&&x>=0n&&x<y);
   }
 }
});
