import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource,evaluateReference,HardwareSourceError} from '../src/compiler.mjs';
const source=(init,fallback='42',trap='trap!')=>'pub fnc main():int { val Option<int> x = '+init+'; return match<int> '+trap+' x.unwrap() over on Ok(n):int -> n, on Err():int -> '+fallback+', end; }';
test('closed checked unwrap generates signed constant RTL, not a runtime exception path',()=>{
 for(const [init,fallback,trap,want] of [['Some(42)','7','trap!','42'],['Some(0)','42','trap!','0'],['Some(-9223372036854775808)','7','trap!','-9223372036854775808'],['Some(9223372036854775807)','7','trap!','9223372036854775807'],['Some(84/2)','7','trap','42'],['None','42','trap!','42'],['None','-9223372036854775808','trap','-9223372036854775808']]){
  const {program,systemVerilog}=compileSource(source(init,fallback,trap));
  assert.equal(program.signed,true);assert.equal(program.returnWidth,64);
  assert.equal(evaluateReference(program,{}),BigInt(want));
  assert.match(systemVerilog,/output logic signed \[63:0\] out_result/);
  assert.match(systemVerilog,/assign out_result = /);
  assert.doesNotMatch(systemVerilog,/always|\$fatal|\$error/);
 }
});
test('unproved tags, effects, bad binders, and arithmetic emit no RTL',()=>{
 const base=source('None');
 for(const s of [base.replace('x.unwrap','y.unwrap'),base.replace('unwrap()','unwrap(1)'),base.replace('unwrap()','expect()'),base.replace('Err()','Err(e)'),base.replace('-> n,','-> x,'),base.replace('Ok(n)','Ok(x)'),base.replace('trap! ','trap!'),base.replace('trap! ','trap!\u00a0'),base.replace('trap! ','panic! '),base.replace('val Option<int>','val Result<int,int>'),base+' trailing','define dimension Option; '+base,source('Some(42/0)'),source('Some(9223372036854775807+1)'),source('None','9223372036854775808')])
  assert.throws(()=>compileSource(s),HardwareSourceError,s);
});

const exact = `declare type Bounded = int where self >= 1 and self <= 42;

pub fnc main() -> int {
    val Option<int> x = None;

    return trap! x.unwrap() |> match<int>  over
        on Ok(n): int -> n,
        on Err(): int -> 42,
    end;
}
`;
test('piped typed match and declared refinement emit exact same RTL as prefix match',()=>{
 const compiled=compileSource(exact);
 assert.equal(evaluateReference(compiled.program,{}),42n);
 assert.match(compiled.systemVerilog,/64'sh000000000000002a/);
 assert.equal(compiled.systemVerilog,compileSource(source('None')).systemVerilog);
 const some=compileSource(exact.replace('= None;','= Some(7);'));
 assert.equal(evaluateReference(some.program,{}),7n);
 assert.match(some.systemVerilog,/64'sh0000000000000007/);
});
test('closed RTL pipeline rejects malformed refinement, discarded payload misuse, and masked separator',()=>{
 for(const s of [exact.replace('<= 42','<= 0'),exact.replace('Bounded','Option'),
 exact.replace('declare type','declare declare type'),exact.replace('Option<int>','Option<Bounded>'),
 exact.replace('trap! x','trap!/*comment*/x'),exact.replace('trap! x','trap!\u00a0x'),
 exact.replace('|>','| >'),exact.replace('Err()','Err(e)'),exact.replace('-> 42','-> 42/0'),
 exact.replace('None','Some(42/0)')])
 assert.throws(()=>compileSource(s),HardwareSourceError,s);
});
