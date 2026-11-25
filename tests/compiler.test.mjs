import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileSource,parseHardwareSource,evaluateReference,HardwareSourceError,TENANT_VM_RUNTIME_SUPPORT} from '../src/compiler.mjs';

const source=readFileSync(new URL('./fixtures/add8.ores', import.meta.url),'utf8');
const {program,systemVerilog}=compileSource(source);

test('Oreslang source compiles to deterministic unsigned 8-bit RTL',()=>{
  assert.match(systemVerilog,/module ores_add8\(/);
  assert.match(systemVerilog,/input logic \[7:0\] in_a/);
  assert.match(systemVerilog,/assign out_result = \(in_a \+ in_b\);/);
  assert.equal(program.returnWidth,8);
});
test('golden SystemVerilog is byte-exact reproducible from Oreslang source',()=>{
  const golden=readFileSync(new URL('./fixtures/add8.generated.sv',import.meta.url),'utf8');
  assert.equal(systemVerilog,golden);
});
test('all 65536 unsigned reference vectors wrap mod 256',()=>{
  for(let a=0;a<256;a++) for(let b=0;b<256;b++)
    assert.equal(evaluateReference(program,{a:BigInt(a),b:BigInt(b)}),BigInt((a+b)&255));
});
test('subtraction underflows by modular arithmetic',()=>{
  const p=parseHardwareSource('pub fnc sub(u8 a, u8 b): u8 { return a - b; }');
  assert.equal(evaluateReference(p,{a:0n,b:1n}),255n);
});
test('actor-owned heap and object allocation fail closed before RTL generation',()=>{
  const candidates=[
    'define class Node as int value Node? next end',
    'define pub class Node as int value end',
    'pub define actor A as end',
    'define actor A as end',
    'pub fnc f(u8 a):u8 { return new Node(a); }'
  ];
  for(const source of candidates){
    assert.throws(()=>compileSource(source),
      e=>e instanceof HardwareSourceError && e.code==='HDL_ACTOR_MEMORY_UNSUPPORTED',
      source);
    assert.throws(()=>parseHardwareSource(source),
      e=>e instanceof HardwareSourceError && e.code==='HDL_ACTOR_MEMORY_UNSUPPORTED',
      source);
  }
  // No SystemVerilog output may be produced for the canonical actor graph.
  const graph='define class Node as int value Node? next end\ndefine actor HeapGraphProbe as receive(int m) { let first = new Node(42, none) assert(first.next?.value == 42) } end';
  assert.throws(()=>compileSource(graph),HardwareSourceError);
  // Comments never introduce active source authority.
  assert.doesNotThrow(()=>compileSource(
    'fnc f(u8 a): u8 { return a; } // define actor HeapGraphProbe as end'));
  assert.doesNotThrow(()=>compileSource(
    'fnc f(u8 a): u8 { return a; } /* new Node(a) */'));
});

test('unsupported syntax and unsafe inputs fail closed',()=>{
  const cases=[
    ['fnc f(u8 a): u16 { return a; }','HDL_RETURN_WIDTH'],
    ['fnc f(u8 a,u16 b): u8 { return a+b; }','HDL_MISMATCH'],
    ['fnc f(u8 a,u8 a): u8 { return a; }','HDL_DUPLICATE'],
    ['fnc f(u8 a):u8 { return a*a; }','HDL_TOKEN'],
    ['fnc f(u8 a):u8 { spawn a; }','HDL_ACTOR_UNSUPPORTED'],
    ['fnc f(u8 a):u8 { return unknown; }','HDL_UNBOUND'],
    ['fnc f(u65 a):u65 {return a;}','HDL_WIDTH'],
    ['fnc f(int a):int {return a;}','HDL_WIDTH'],
    ['fnc f(u8 a):u8 {return a;} more','HDL_SYNTAX'],
    ['fnc f(u8 a):u8 {return a;} `include "evil"','HDL_TOKEN']
  ];
  for(const [s,code] of cases){
    assert.throws(()=>parseHardwareSource(s),e=>e instanceof HardwareSourceError && e.code===code,code+' / '+s);
  }
});
test('input type and value validation refuses coercion',()=>{
  assert.throws(()=>evaluateReference(program,{a:1,b:2n}),TypeError);
  assert.throws(()=>evaluateReference(program,{a:256n,b:0n}),RangeError);
});

test('RTL-reserved identifiers and malformed source fail closed',()=>{
  for(const name of ['module','case','function','parameter','interface','signed','time','initial','out_result']){
    assert.throws(()=>compileSource('fnc '+name+'(u8 a, u8 b): u8 { return a + b; }'),HardwareSourceError);
    assert.throws(()=>compileSource('fnc f(u8 '+name+', u8 b): u8 { return b + b; }'),HardwareSourceError);
  }
  assert.throws(()=>compileSource('fnc f(u8 a): u8 { return a; }'+String.fromCharCode(0)),HardwareSourceError);
  assert.throws(()=>compileSource('fnc f(u8 a): u8 { return a; }'+String.fromCharCode(0xD800)),HardwareSourceError);
});

test('bitwise precedence and 64-bit oracle preserve fixed-width semantics',()=>{
  const cases=[
    ['a | b & c',{a:1n,b:2n,c:0n},1n],
    ['a ^^ b & c',{a:3n,b:3n,c:1n},2n],
    ['a + b & c',{a:255n,b:1n,c:3n},0n],
    ['a | b ^^ c',{a:1n,b:3n,c:2n},1n],
    ['(a | b) & c',{a:1n,b:2n,c:2n},2n]
  ];
  for(const [expr,inputs,expected] of cases){
    const {program}=compileSource('fnc f(u8 a, u8 b, u8 c): u8 { return '+expr+'; }');
    assert.equal(evaluateReference(program,inputs),expected,expr);
  }
  const {program}=compileSource('fnc f(u64 a, u64 b): u64 { return a - b; }');
  assert.equal(evaluateReference(program,{a:0n,b:1n}),(1n<<64n)-1n);
  for(const op of ['&','|','^^']){
    const {program:p,systemVerilog}=compileSource('fnc f(u64 a, u64 b): u64 { return a '+op+' b; }');
    assert.ok(systemVerilog.includes(' '+(op==='^^'?'^':op)+' '));
    assert.equal(evaluateReference(p,{a:(1n<<64n)-1n,b:1n}),op==='&'?1n:op==='|'?(1n<<64n)-1n:(1n<<64n)-2n);
  }
});

test('reference evaluator rejects inherited and missing inputs',()=>{
  const {program}=compileSource('fnc f(u8 constructor): u8 { return constructor; }');
  assert.throws(()=>evaluateReference(program,{}),/missing input/);
  assert.equal(evaluateReference(program,{constructor:7n}),7n);
  assert.throws(()=>evaluateReference(program,Object.create({constructor:7n})),/missing input/);
  assert.throws(()=>evaluateReference(program,null),/missing input/);
});
test('source limit measures UTF-8 bytes rather than UTF-16 code units',()=>{
  const source='fnc f(u8 a): u8 { return a; }'+'/*'+'é'.repeat(66000)+'*/';
  assert.throws(()=>compileSource(source),/HDL_SOURCE_LIMIT/);
});

test('long arithmetic chains are rejected before RTL emission',()=>{
  const chain='a'+('+a').repeat(1030);
  assert.throws(()=>compileSource('fnc f(u8 a): u8 { return '+chain+'; }'),
    e=>e instanceof HardwareSourceError && e.code==='HDL_EXPR_LIMIT');
});


test('canonical typed Topic.try_publish alias fails before any HDL RTL artifact',()=>{
  const canonical=readFileSync(new URL('./fixtures/canonical-unlowered-try-publish.atto',import.meta.url),'utf8');
  const reject=e=>e instanceof HardwareSourceError &&
    e.code==='HDL_ACTOR_PUBSUB_UNSUPPORTED' &&
    e.message.includes('Topic.try_publish');
  for(const source of [
    canonical,
    'fnc f(u8 a):u8 {return alias.try_publish(share! event);}',
    'fnc f(u8 a):u8 {return alias /* outer /* nested */ end */ . try_publish(share! event);}',
    'fnc f(u8 a):u8 {return alias?.try_publish(share! event);}',
    'fnc f(u8 a):u8 {return alias.try_publish;}',
    '// ignored alias.try_publish(1)?\nfnc f(u8 a):u8 {return other.try_publish(1);}'
  ]) {
    assert.throws(()=>parseHardwareSource(source),reject,source);
    assert.throws(()=>compileSource(source),reject,source);
  }
});

test('typed Topic pubsub denial ignores inert comments and literals',()=>{
  // Standalone similarly named callables remain distinct; an irrelevant
  // comment or string may still be rejected by the scalar RTL grammar,
  // but must not be falsely labelled typed Topic publication.
  const allowed='fnc try_publish(u8 value):u8{return value;}';
  assert.equal(compileSource(allowed).program.name,'try_publish');
  for(const source of [
    'fnc f(u8 a):u8{return a;} // alias.try_publish(share! event)?',
    'fnc f(u8 a):u8{return a;} /* alias.try_publish(share! event) */',
    'fnc f(u8 a):u8{return a;} /* nested /* alias.try_publish() */ outer */',
    'fnc f(u8 a):u8{return alias.try_publisher;}',
    'fnc f(u8 a):u8{return "alias.try_publish(1)";}'
  ]) {
    try { compileSource(source); }
    catch(e) { assert.notEqual(e.code,'HDL_ACTOR_PUBSUB_UNSUPPORTED',source); }
  }
});

test('TenantVM and actor execution fail closed in HDL compiler',()=>{
  assert.equal(TENANT_VM_RUNTIME_SUPPORT,'UNSUPPORTED');
  for(const source of ['define actor Worker as end','define tenant_vm Evil as end'])
    assert.throws(()=>compileSource(source),HardwareSourceError);
  assert.match(compileSource('fnc pass(u8 a):u8 {return a;}').systemVerilog,/module ores_pass/);
});
