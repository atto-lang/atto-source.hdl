import test from 'node:test';
import assert from 'node:assert/strict';
import {compileCheckedNamespaceProvider,evaluateReference,emitSystemVerilog,compileSource} from '../src/compiler.mjs';
const compile=(expr,params='int x, int y',arity=2)=>compileCheckedNamespaceProvider(
  'namespace billing;\npub fnc function0('+params+'): int { return '+expr+'; }\n','billing','function0',arity);
test('signed reference validates every input, including unused parameters',()=>{
 const {program}=compile('x');
 assert.equal(evaluateReference(program,{x:-42n,y:0n}),-42n);
 assert.throws(()=>evaluateReference(program,{x:1n,y:2}),TypeError);
 assert.throws(()=>evaluateReference(program,{x:1n,y:1n<<63n}),RangeError);
 assert.throws(()=>evaluateReference(program,{x:1n,y:-(1n<<63n)-1n}),RangeError);
 let touched=false;
 assert.throws(()=>evaluateReference(program,{x:1n,get y(){touched=true;return 0n;}}),TypeError);
 assert.equal(touched,false);
 assert.throws(()=>emitSystemVerilog({...program}),e=>e.code==='HDL_UNVERIFIED_AST');
});
test('checked arithmetic rejects intermediate overflow and min negation',()=>{
 const max=(1n<<63n)-1n,min=-(1n<<63n);
 const cases=[['x * y + 2',{x:-10n,y:4n},-38n],['x + y',{x:max,y:0n},max],['x - y',{x:min,y:0n},min]];
 for(const [expr,args,value] of cases)assert.equal(evaluateReference(compile(expr).program,args),value);
 for(const [expr,args] of [['(x + 1) - 1',{x:max,y:0n}],['x * y',{x:min,y:-1n}],['-x',{x:min,y:0n}],['x - y',{x:min,y:1n}]])
  assert.throws(()=>evaluateReference(compile(expr).program,args),RangeError);
 assert.equal(evaluateReference(compile('-9223372036854775808','',0).program,{}),min);
 for(const expr of ['9223372036854775808','01','x()','z','x / y','x; return y'])
  assert.throws(()=>compile(expr));
});
test('RTL checked output uses widened intermediate and fault suppression',()=>{
 const {systemVerilog}=compile('x * y + 2');
 assert.match(systemVerilog,/wire signed \[127:0\]/);
 assert.match(systemVerilog,/assign out_fault = f_\d+;/);
 assert.match(systemVerilog,/assign out_result = out_fault \? 64'sd0 : v_\d+;/);
});
