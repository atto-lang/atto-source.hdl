import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileSource,HardwareSourceError} from '../src/compiler.mjs';

const sharedGuest=readFileSync(new URL('./fixtures/atto-theater-v1/checked-i64-terminal.atto',
                                   import.meta.url),'utf8');
const fixtureSha=createHash('sha1')
  .update('blob '+Buffer.byteLength(sharedGuest,'utf8')+String.fromCharCode(0))
  .update(sharedGuest,'utf8').digest('hex');
const scenarios=[
  'define actor Worker as end',
  'define supervisor Root as end',
  'pub fnc add(u8 a): u8 { return spawn Worker(); }',
  'pub fnc add(u8 a): u8 { return receive(a); }',
  'pub fnc add(u8 a): u8 { return ActorGroup(a); }',
  'pub fnc add(u8 a): u8 { return Topic(a); }',
  'pub fnc add(u8 a): u8 { return Subscription(a); }',
  sharedGuest,
];

test('Theater/Director/Ensemble source cannot become accidental combinational RTL',()=>{
  assert.equal(fixtureSha,'8a981a3545e0307387af83b0fc306c012d52f831');
  for(const source of scenarios) {
    assert.throws(()=>compileSource(source),
      e=>e instanceof HardwareSourceError && e.code===(source.startsWith('define actor') || source===sharedGuest?'HDL_ACTOR_MEMORY_UNSUPPORTED':'HDL_ACTOR_UNSUPPORTED'),source);
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
      assert.match(child.stderr,sample.startsWith('define actor') || sample===sharedGuest?/HDL_ACTOR_MEMORY_UNSUPPORTED/:/HDL_ACTOR_UNSUPPORTED/);
      assert.equal(existsSync(output),false,'unsupported actor source emitted RTL');
    }
  }finally {rmSync(dir,{recursive:true,force:true});}
});

test('exact shared Ensemble share! fixture is denied as typed unsupported source',()=>{
  const source=readFileSync(new URL(
    './fixtures/atto-ensemble-v1/canonical-unlowered-try-publish.atto',
    import.meta.url),'utf8');
  const oid=createHash('sha1')
    .update('blob '+Buffer.byteLength(source,'utf8')+String.fromCharCode(0))
    .update(source,'utf8').digest('hex');
  assert.equal(oid,'c562ad380bb283da9ffa26160653c1186ab63462');
  for(const candidate of [
    source,
    'pub fnc calc(u8 x): u8 { return topic.try_publish(share! x)?; }',
    'pub fnc calc(u8 x): u8 { return topic /*comment*/ . try_publish(share!x); }',
    'pub fnc calc(u8 x): u8 { return topic?.try_publish(share! x); }'
  ]) assert.throws(()=>compileSource(candidate),
    e=>e instanceof HardwareSourceError && e.code==='HDL_ACTOR_PUBSUB_UNSUPPORTED',
    candidate);
  const inert='pub fnc add(u8 x,u8 y):u8 {return x+y;} '
    +'// topic.try_publish(share! x)?';
  assert.match(compileSource(inert).systemVerilog,/module ores_add\(/);
  assert.throws(()=>compileSource('pub fnc add(u8 x):u8{return x;} '
    +'"topic.try_publish(share! x)"'),
    e=>e instanceof HardwareSourceError && e.code==='HDL_TOKEN',
    'string literals must not become actor capability evidence');
});

test('actual HDL CLI emits no RTL for canonical Ensemble source',()=>{
  const dir=mkdtempSync(join(tmpdir(),'atto-hdl-ensemble-'));
  try{
    const source=join(dir,'ensemble.atto'),output=join(dir,'ensemble.sv');
    const cli=fileURLToPath(new URL('../bin/oreslang-hdl.mjs',import.meta.url));
    writeFileSync(source,readFileSync(new URL(
      './fixtures/atto-ensemble-v1/canonical-unlowered-try-publish.atto',
      import.meta.url)));
    const result=spawnSync(process.execPath,[cli,source,output],
      {encoding:'utf8',timeout:30000});
    assert.equal(result.status,1,result.stderr);
    assert.match(result.stderr,/HDL_ACTOR_PUBSUB_UNSUPPORTED/);
    assert.equal(existsSync(output),false,'unlowered Ensemble source emitted RTL');
  }finally{rmSync(dir,{recursive:true,force:true});}
});
