import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const workflow=readFileSync(new URL('../.github/workflows/private-ci-policy.yml',import.meta.url),'utf8');
const allowlist=readFileSync(new URL('../.github/private-ci-approved-repositories.txt',import.meta.url),'utf8');
const pattern=/^[ \t]*(#.*)?$/;

test('private source policy keeps source transfers disabled by default',()=>{
  for(const line of allowlist.split('\n'))
    assert.match(line,pattern,'active source-export destination is forbidden');
});

test('workflow contains one unbroken deny-default guard and synthetic control',()=>{
  const expected="if grep -Evq '^[[:space:]]*(#.*)?$' \"$file\"; then";
  assert.equal(workflow.split(expected).length-1,1);
  assert.equal(workflow.split('PRIVATE_CI_EXPORT_REJECTED:').length-1,1);
  assert.match(workflow,/persist-credentials: false/);
  assert.match(workflow,/git diff --cached --quiet --exit-code HEAD --/);
  assert.match(workflow,/git write-tree/);
  assert.match(workflow,/git ls-files --others --ignored/);
  assert.match(workflow,/if ! grep -Evq '\^\[\[:space:\]\]\*\(#\.\*\)\?\$' "\$fixture"; then/);
  assert.doesNotMatch(workflow,/if grep -Evq '\^\[\[:space:\]\]\*\(#\.\*\)\?\n/);
});
