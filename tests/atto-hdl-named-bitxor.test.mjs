import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileSource,parseHardwareSource,emitSystemVerilog,evaluateReference,HardwareSourceError}
  from '../src/compiler.mjs';

const src=(expression,width='u8')=>
  'fnc f('+width+' a, '+width+' b): '+width+' { return '+expression+'; }';
const rejects=code=>e=>e instanceof HardwareSourceError && e.code===code;

test('canonical .atto sample emits byte-exact pinned RTL and preserves legacy source',()=>{
  const atto=readFileSync(new URL('./fixtures/add8.atto',import.meta.url),'utf8');
  const legacy=readFileSync(new URL('./fixtures/add8.ores',import.meta.url),'utf8');
  const golden=readFileSync(new URL('./fixtures/add8.generated.sv',import.meta.url),'utf8');
  assert.equal(atto,legacy);
  assert.equal(compileSource(atto).systemVerilog,golden);
});

test('named integer XOR lowers to hardware XOR across fixed widths',()=>{
  for(const width of [1,8,16,32,64]){
    const {program,systemVerilog}=compileSource(src('Integer.bitXor(a,b)','u'+width));
    assert.match(systemVerilog,/assign out_result = \(in_a \^ in_b\);/);
    const mask=(1n<<BigInt(width))-1n;
    for(const [a,b] of [[0n,0n],[mask,mask],[mask,1n],[mask,mask>>1n]])
      assert.equal(evaluateReference(program,{a,b}),a^b);
    const nested=parseHardwareSource(src('Integer.bitXor(a,Integer.bitXor(b,a))','u'+width));
    assert.equal(evaluateReference(nested,{a:mask,b:1n}),1n);
  }
});

test('removed punctuation fails closed, including nested expressions',()=>{
  for(const op of ['^','^^','%']){
    for(const expr of ['a '+op+' b','(a '+op+' b) & a',
                       'Integer.bitXor(a,b) '+op+' a'])
      assert.throws(()=>compileSource(src(expr)),rejects('HDL_REMOVED_OPERATOR'),expr);
  }
  let err;
  try {compileSource(src('a ^ b'));} catch(e){err=e;}
  assert.ok(err instanceof HardwareSourceError);
  assert.match(err.message,/Integer\.bitXor/);
});

test('intrinsic namespace, arity, and width are explicitly checked',()=>{
  for(const expr of ['Integer.rem(a,b)','Integer.bitAnd(a,b)','Integer.bitxor(a,b)'])
    assert.throws(()=>compileSource(src(expr)),rejects('HDL_INTRINSIC'));
  for(const expr of ['Integer.bitXor(a)','Integer.bitXor(a,b,a)',
                      'Integer.bitXor(a,b); return a'])
    assert.throws(()=>compileSource(src(expr)),rejects('HDL_SYNTAX'));
  assert.throws(()=>compileSource(
    'fnc f(u8 a,u16 b):u8 { return Integer.bitXor(a,b); }'
  ),rejects('HDL_MISMATCH'));
  assert.throws(()=>compileSource(
    'fnc f(u8 Integer,u8 b):u8 { return Integer.bitXor(Integer,b); }'
  ),rejects('HDL_INTRINSIC_SHADOW'));
});

test('removed punctuation inside comments does not change admission',()=>{
  const source='fnc f(u8 a,u8 b):u8 { /* ^ ^^ % */ return Integer.bitXor(a,b); }';
  const program=parseHardwareSource(source);
  assert.match(emitSystemVerilog(program),/in_a \^ in_b/);
  assert.equal(evaluateReference(program,{a:5n,b:3n}),6n);
});

test('language operators are not silently reinterpreted as bitwise hardware',()=>{
  for(const expr of ['a & b','a | b','(a | b)','Integer.bitXor(a,b) & a','a | Integer.bitXor(a,b)'])
    assert.throws(()=>compileSource(src(expr)),rejects('HDL_UNLOWERED_SOURCE_OPERATOR'),expr);
  const source='fnc f(u8 a,u8 b):u8 { /* a | b and a & b */ return a+b; }';
  assert.equal(evaluateReference(compileSource(source).program,{a:2n,b:5n}),7n);
});
