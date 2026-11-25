import test from 'node:test';
import assert from 'node:assert/strict';
import {lex} from '../src/compiler.mjs';
for(const keyword of ['trap!','throw!','raise!','panic!','copy!','copy!!','take!','borrow!','share!','pin!','drop!','pipe!','rpipe!','stop!','expand!']) {
 test('HDL rejects compact '+keyword,()=>{
   for(const tail of ['value','(42)','/*comment*/ value','','\u00a0value'])
     assert.throws(()=>lex(keyword+tail),/E_BANG_KEYWORD_WHITESPACE/);
 });
}
test('comment contents remain opaque',()=>{
 assert.doesNotThrow(()=>lex('// trap!(42)\n/* copy!!value */'));
});
