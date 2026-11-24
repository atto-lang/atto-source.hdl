import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lex,parseHardwareSource,HardwareSourceError} from '../src/compiler.mjs';

const source = expression => 'pub fnc main(u8 item): u8 { return '+expression+'; }';

test('HDL never emits RTL for unsupported copy/take/borrow/share', () => {
  for (const expression of [
    'copy!item', 'copy!!item', 'take!item', 'borrow!item', 'borrow! item',
    'borrow!mut item', 'borrow! mut item',
    'mut borrow!item', 'mut borrow! item', 'share!item',
    'borrow!\nmut item', 'borrow!/* checked loan */mut item',
    'mut borrow!\nitem',
  ]) {
    for (const compile of [lex,parseHardwareSource]) {
      assert.throws(() => compile(source(expression)),
        err => err instanceof HardwareSourceError &&
          err.code === 'HDL_OWNERSHIP_UNSUPPORTED',expression);
    }
  }
});

test('ownership-looking comments are inert, positive HDL unchanged', () => {
  const program=parseHardwareSource(
    'pub fnc main(u8 item): u8 { /* borrow! mut item */ return item; }');
  assert.equal(program.returnWidth,8);
  assert.doesNotThrow(() => lex(
    'pub fnc main(u8 item): u8 { // borrow! mut item\n return item; }'));
});

test('whitespace before bang is not the ownership operator', () => {
  assert.throws(() => parseHardwareSource(source('borrow !item')),
    err => err instanceof HardwareSourceError &&
      err.code !== 'HDL_OWNERSHIP_UNSUPPORTED');
});

test('nested block comments are inert and bounded before RTL emission', () => {
  const nested='pub fnc main(u8 item): u8 { /* outer /* borrow! mut item */ '+
    'inner tail /* copy!item */ */ return item; }';
  const parsed=parseHardwareSource(nested);
  assert.equal(parsed.returnWidth,8);
  assert.doesNotThrow(() => lex(nested));
  assert.throws(() => lex('/* outer /* borrow! item */'), err =>
    err instanceof HardwareSourceError && err.code === 'HDL_TOKEN' && /unterminated block comment/.test(err.message));
  assert.throws(() => lex('/*'.repeat(129)+'*/'.repeat(129)), err =>
    err instanceof HardwareSourceError && err.code === 'HDL_TOKEN' && /nesting budget/.test(err.message));
});

test('the CLI emits RTL only for supported source', () => {
  const dir=mkdtempSync(join(tmpdir(),'atto-hdl-borrow-'));
  const cli=fileURLToPath(new URL('../bin/oreslang-hdl.mjs',import.meta.url));
  const input=join(dir,'main.atto'),output=join(dir,'main.sv');
  try {
    for(const expression of ['take!item','borrow! mut item','share!item','copy!item','copy!!item']){
      writeFileSync(input,source(expression));
      const result=spawnSync(process.execPath,[cli,input,output],{encoding:'utf8',timeout:10000});
      assert.ifError(result.error);
      assert.equal(result.status,1,result.stderr);
      assert.match(result.stderr,/\bHDL_OWNERSHIP_UNSUPPORTED\b/,expression);
      assert.equal(existsSync(output),false,expression);
    }
    writeFileSync(input,source('/* outer /* borrow! mut item */ copy!!item */ item'));
    const result=spawnSync(process.execPath,[cli,input,output],{encoding:'utf8',timeout:10000});
    assert.ifError(result.error);
    assert.equal(result.status,0,result.stderr);
    assert.match(readFileSync(output,'utf8'),/assign out_result = in_item;/);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
});
