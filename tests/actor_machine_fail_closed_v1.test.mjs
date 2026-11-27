import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compileSource, TENANT_VM_RUNTIME_SUPPORT } from '../src/compiler.mjs';

const machine = `define actor Foo as
    state { let int count: 0; }
    state machine as
        initial state Idle;
        state Idle as
            on Start() -> Running;
        end
        state Running as
            on Stop() -> Idle;
        end
    end
end
`;
const unsupported = [
    machine,
    machine.replace('define actor', 'define pub actor'),
    machine.replace('state { let int count: 0; }', 'state {}'),
    machine.replace('define actor', 'define durable actor'),
];
const scalar = 'pub fnc add8(u8 a, u8 b): u8 { return a + b; }';
const cli = fileURLToPath(new URL('../bin/oreslang-hdl.mjs', import.meta.url));

test('ordinary scalar RTL remains supported', () => {
    assert.match(compileSource(scalar).systemVerilog, /module ores_add8/);
    assert.equal(TENANT_VM_RUNTIME_SUPPORT, 'UNSUPPORTED');
});
test('machine actors cannot enter the combinational RTL compiler', () => {
    for (const source of unsupported)
        assert.throws(() => compileSource(source), error =>
            ['HDL_ACTOR_MEMORY_UNSUPPORTED', 'HDL_DURABLE_ACTOR_UNSUPPORTED'].includes(error.code));
});
test('actual CLI rejects all actor fixtures before publishing RTL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'atto-hdl-machine-'));
    try {
        const input = join(dir, 'input.atto'), output = join(dir, 'output.sv');
        for (const source of unsupported) {
            writeFileSync(input, source);
            const result = spawnSync(process.execPath, [cli, input, output],
                {encoding:'utf8', timeout:10000});
            assert.ifError(result.error);
            assert.equal(result.status, 1, result.stderr);
            assert.match(result.stderr, /HDL_(ACTOR_MEMORY|DURABLE_ACTOR)_UNSUPPORTED/);
            assert.equal(existsSync(output), false);
        }
        writeFileSync(input, scalar);
        const result = spawnSync(process.execPath, [cli, input, output],
            {encoding:'utf8', timeout:10000});
        assert.ifError(result.error);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(existsSync(output), true);
    } finally {
        rmSync(dir, {recursive:true, force:true});
    }
});
