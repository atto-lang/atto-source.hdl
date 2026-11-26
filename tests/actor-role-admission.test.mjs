import test from 'node:test';
import assert from 'node:assert/strict';
import {compileSource, lex, HardwareSourceError, TENANT_VM_RUNTIME_SUPPORT} from '../src/compiler.mjs';

const reject = (source, code, marker) => {
  for (const compile of [lex, compileSource])
    assert.throws(() => compile(source), e => e instanceof HardwareSourceError &&
      e.code === code && e.offset === source.lastIndexOf(marker));
};

test('hosted actor declaration roles fail closed before generic syntax or RTL', () => {
  assert.equal(TENANT_VM_RUNTIME_SUPPORT, 'UNSUPPORTED');
  for (const modifiers of ['', 'serial ', 'unary ', 'stream ', 'serial unary ',
    'serial stream ', 'unary http ', 'tcp ', 'websocket ', 'virtual ',
    'proxy ', 'pub abstract ', 'isolated stream ']) {
    const source = 'define ' + modifiers + 'actor Counter<T> as end';
    reject(source, 'HDL_ACTOR_MEMORY_UNSUPPORTED', 'actor');
  }
  reject('define serial /* trivia */ unary actor Worker as end',
    'HDL_ACTOR_MEMORY_UNSUPPORTED', 'actor');
});

test('dynamic proxy and virtual handle types are explicitly unsupported', () => {
  for (const type of ['ProxyActor', 'VirtualActor', 'ActorRef'])
    reject('fnc f(' + type + '<Worker> w): u8 { return w; }',
      'HDL_ACTOR_UNSUPPORTED', type);
});

test('actor modifier identifiers and inert comment examples remain valid RTL', () => {
  const source = 'fnc f(u8 serial, u8 unary, u8 stream, u8 virtual, u8 proxy): u8 { ' +
    '/* define serial unary actor Example<T> as end */ ' +
    'return serial + unary + stream + virtual + proxy; }';
  assert.match(compileSource(source).systemVerilog, /module ores_f\(/);
  assert.match(compileSource('fnc unary(u8 stream): u8 { return stream; }').systemVerilog,
    /assign out_result = in_stream;/);
});
