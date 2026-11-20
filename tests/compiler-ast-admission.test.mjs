import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHardwareSource,emitSystemVerilog,evaluateReference,HardwareSourceError}
  from '../src/compiler.mjs';

const source='pub fnc add(u8 a,u8 b): u8 { return a+b; }';
const denied=e=>e instanceof HardwareSourceError && e.code==='HDL_UNVERIFIED_AST';

test('parser-admitted program and nested input/expression trees are immutable',()=>{
  const program=parseHardwareSource(source);
  assert.ok(Object.isFrozen(program));
  assert.ok(Object.isFrozen(program.params));
  assert.ok(Object.isFrozen(program.params[0]));
  assert.ok(Object.isFrozen(program.expression));
  assert.ok(Object.isFrozen(program.expression.left));
  assert.ok(Object.isFrozen(program.expression.right));
  assert.throws(()=>{program.name='injected';},TypeError);
  assert.throws(()=>{program.params[0].name='output';},TypeError);
  assert.throws(()=>{program.expression.op='; endmodule';},TypeError);
  assert.throws(()=>{program.expression.right.name='fake';},TypeError);
  assert.match(emitSystemVerilog(program),/assign out_result = \(in_a \+ in_b\)/);
  assert.equal(evaluateReference(program,{a:12n,b:31n}),43n);
});

test('caller-constructed program cannot inject RTL or bypass frontend checks',()=>{
  const program=parseHardwareSource(source);
  const forged={...program,name:'escape); endmodule\nmodule injected'};
  assert.throws(()=>emitSystemVerilog(forged),denied);
  assert.throws(()=>evaluateReference(forged,{a:1n,b:2n}),denied);
  assert.throws(()=>emitSystemVerilog(Object.assign({},program)),denied);
  assert.throws(()=>emitSystemVerilog({name:'evil',params:[],expression:{kind:'input'}}),denied);
});

test('Proxy wrapper is not an admitted AST',()=>{
  const program=parseHardwareSource(source);
  const proxy=new Proxy(program,{});
  assert.throws(()=>emitSystemVerilog(proxy),denied);
  assert.throws(()=>evaluateReference(proxy,{a:1n,b:2n}),denied);
});

test('independent parsed programs remain separately admitted',()=>{
  const first=parseHardwareSource(source),second=parseHardwareSource(source);
  assert.notStrictEqual(first,second);
  assert.equal(emitSystemVerilog(first),emitSystemVerilog(second));
  assert.equal(evaluateReference(first,{a:255n,b:1n}),0n);
  assert.equal(evaluateReference(second,{a:0n,b:1n}),1n);
});

test('reference vectors reject getter and Proxy-backed inputs without invoking them',()=>{
  const program=parseHardwareSource(source);
  let getters=0,traps=0;
  const supplied={a:1n};
  Object.defineProperty(supplied,'b',{enumerable:true,get(){getters++;return 2n;}});
  assert.throws(()=>evaluateReference(program,supplied),TypeError);
  assert.equal(getters,0);
  const wrapped=new Proxy({a:1n,b:2n},{get(target,key){
    traps++;return Reflect.get(target,key);
  }});
  assert.throws(()=>evaluateReference(program,wrapped),TypeError);
  assert.equal(traps,0);
});
test('reference input vector rejects foreign or hidden fields, retains null-prototype records',()=>{
  const program=parseHardwareSource(source);
  const foreign={a:1n,b:2n,hidden:'extra'};
  assert.throws(()=>evaluateReference(program,foreign),TypeError);
  const symbol={a:1n,b:2n};
  symbol[Symbol('extra')]=1n;
  assert.throws(()=>evaluateReference(program,symbol),TypeError);
  const record=Object.assign(Object.create(null),{a:2n,b:3n});
  assert.equal(evaluateReference(program,record),5n);
});
