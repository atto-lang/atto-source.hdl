import assert from 'node:assert/strict';
import {compileBooleanReduction as compile} from '../src/boolean_reduction.mjs';
const src=e=>`fnc gate(bool a, bool b): bool { return ${e}; }`;
let pos=0,neg=0;
for(const [expr,rtl] of [['And(a,b)','(in_0 & in_1)'],['Or(a,b)','(in_0 | in_1)'],['Xor(a,b)','(in_0 ^ in_1)'],['And([])',"1'b1"],['Or([])',"1'b0"],['Xor([])',"1'b0"],['Xor([a])','(in_0)'],['And([a,b,a])','(in_0 & in_1 & in_0)'],['!a || b && a','((!in_0) | (in_1 & in_0))']]){const r=compile(src(expr));assert.equal(r.parameterCount,2);assert.ok(r.systemVerilog.includes('assign out_result = '+rtl+';'));assert.equal(compile(src(expr)).systemVerilog,r.systemVerilog);pos++;}
for(const gate of ['And','Or','Xor'])for(const args of ['', 'a','a,1','[a,1]','[[a]]','[a],[b]','a,','['+Array(33).fill('a').join(',')+']']){assert.throws(()=>compile(src(`${gate}(${args})`)),/HDL_BOOL_(UNSUPPORTED|LIMIT)/);neg++;}
for(const s of [src('a')+' trailing',src('a').replace('bool b','int b'),src('a').replace('bool b','bool a'),src('a').replace('bool b','bool And'),src('a').replace('bool b','bool true'),src('a').replace('bool b','bool import'),src('a').replace('bool b','bool await'),src('a').replace('return a','return stdio()'),src('!'.repeat(40)+'a'),src('a')+'\u2028',src('a')+'\0']){assert.throws(()=>compile(s),/HDL_BOOL_(UNSUPPORTED|LIMIT)/);neg++;}
console.log(JSON.stringify({structural_emission_cases:pos,rejection_cases:neg,rtl_simulation:'NOT_EXECUTED'}));
