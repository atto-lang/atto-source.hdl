import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,symlinkSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const cli=fileURLToPath(new URL('../bin/oreslang-hdl.mjs',import.meta.url));
const sample='pub fnc f(u8 a, u8 b): u8 { return a+b; }';
function fixture(runTest) {
  const dir=mkdtempSync(join(tmpdir(),'ores-hdl-cli-'));
  const source=join(dir,'program.ores');
  const output=join(dir,'program.sv');
  try {
    writeFileSync(source,sample);
    const run=(input=source,out=output)=>spawnSync(process.execPath,[cli,input,out],
      {encoding:'utf8',timeout:30000});
    return runTest({dir,source,output,run});
  }finally{rmSync(dir,{recursive:true,force:true});}
}

test('CLI emits correct RTL for a small admitted UTF-8 program',()=>{
  fixture(({run,output})=>{
    const result=run();
    assert.equal(result.status,0,result.stderr);
    assert.match(readFileSync(output,'utf8'),/module ores_f\(/);
  });
});

test('CLI refuses oversized input without creating an output file',()=>{
  fixture(({source,output,run})=>{
    writeFileSync(source,' '.repeat(128*1024+1));
    const result=run();
    assert.equal(result.status,1,result.stderr);
    assert.match(result.stderr,/HDL_SOURCE_LIMIT/);
    assert.equal(existsSync(output),false);
  });
});

test('CLI rejects invalid UTF-8 instead of replacement decoding',()=>{
  fixture(({source,output,run})=>{
    writeFileSync(source,Buffer.from([0x66,0x6e,0x63,0xc3,0x28]));
    const result=run();
    assert.equal(result.status,1,result.stderr);
    assert.equal(existsSync(output),false);
  });
});

test('CLI refuses a symlinked source',()=>{
  fixture(({dir,source,output,run})=>{
    const link=join(dir,'linked.ores');
    symlinkSync(source,link);
    const result=run(link);
    assert.equal(result.status,1,result.stderr);
    assert.equal(existsSync(output),false);
  });
});

test('CLI preserves an existing output file and does not overwrite it',()=>{
  fixture(({output,run})=>{
    writeFileSync(output,'ORIGINAL OUTPUT\n');
    const result=run();
    assert.equal(result.status,1,result.stderr);
    assert.equal(readFileSync(output,'utf8'),'ORIGINAL OUTPUT\n');
  });
});
