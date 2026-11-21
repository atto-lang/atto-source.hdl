import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileSource,HardwareSourceError} from '../src/compiler.mjs';

const scenarios=[
  'define actor Worker as end',
  'define supervisor Root as end',
  'pub fnc add(u8 a): u8 { return spawn Worker(); }',
  'pub fnc add(u8 a): u8 { return receive(a); }',
  'pub fnc add(u8 a): u8 { return ActorGroup(a); }',
  'pub fnc add(u8 a): u8 { return Topic(a); }',
  'pub fnc add(u8 a): u8 { return Subscription(a); }',
];

test('Theater/Director/Ensemble source cannot become accidental combinational RTL',()=>{
  for(const source of scenarios) {
    assert.throws(()=>compileSource(source),
      e=>e instanceof HardwareSourceError && e.code==='HDL_ACTOR_UNSUPPORTED',source);
  }
});

test('comments and unrelated user identifiers never trigger Theater denial',()=>{
  const valid=[
    '// define actor Worker as end; spawn Topic(a);',
    'pub fnc supervisor_count(u8 actor_count, u8 other): u8 {',
    '/* define supervisor Root as end */',
    'return actor_count + other; }'
  ].join('\n');
  const {systemVerilog}=compileSource(valid);
  assert.match(systemVerilog,/module ores_supervisor_count\(/);
  assert.match(systemVerilog,/in_actor_count \+ in_other/);
});

test('real CLI refuses unsupported Theater actor source without producing RTL',()=>{
  const dir=mkdtempSync(join(tmpdir(),'atto-hdl-theater-reject-'));
  try {
    const source=join(dir,'actor.atto'),output=join(dir,'actor.sv');
    const cli=fileURLToPath(new URL('../bin/oreslang-hdl.mjs',import.meta.url));
    for(const sample of scenarios) {
      writeFileSync(source,sample);
      const child=spawnSync(process.execPath,[cli,source,output],
        {encoding:'utf8',timeout:30000});
      assert.equal(child.status,1,child.stderr);
      assert.match(child.stderr,/HDL_ACTOR_UNSUPPORTED/);
      assert.equal(existsSync(output),false,'unsupported actor source emitted RTL');
    }
  }finally {rmSync(dir,{recursive:true,force:true});}
});
