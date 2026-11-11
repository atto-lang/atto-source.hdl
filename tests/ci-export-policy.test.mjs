import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePrivateCiDestinations} from '../scripts/validate-ci-export-policy.mjs';

const canonical=readFileSync(new URL('../.github/private-ci-approved-repositories.txt',import.meta.url),'utf8');
const expected='gha-indie-worker/gha-indie-worker-docs 1351003564\n';

test('proposed private destination matches its exact numeric repository identity',()=>{
  assert.deepEqual(parsePrivateCiDestinations(canonical),[
    {name:'gha-indie-worker/gha-indie-worker-docs',id:'1351003564'}
  ]);
  assert.deepEqual(parsePrivateCiDestinations('# disabled by default\n'),[]);
});
test('malformed, broadened and alias destinations all fail closed',()=>{
  const variants=[
    expected+expected,
    'gha-indie-worker/gha-indie-worker-docs 1351003565\n',
    'gha-indie-worker/not-our-repo 1351003564\n',
    'ore-truffle-oreslang/oreslang-source.hdl 1351003564\n',
    'gha-indie-worker/* 1351003564\n',
    'gha-indie-worker/gha-indie-worker-docs 1351003564 # inline\n',
    ' gha-indie-worker/gha-indie-worker-docs 1351003564\n',
    'gha-indie-worker/gha-indie-worker-docs\t1351003564\n',
    'Gha-indie-worker/gha-indie-worker-docs 1351003564\n',
    'gha-indie-worker/gha-indie-worker-docs 1351003564\r\n',
    '\ufeff'+expected,
    expected.trim(),
    expected+'# comment\n'+expected,
    '\u0000'+expected,
    'x'.repeat(4097)
  ];
  for(const raw of variants)
    assert.throws(()=>parsePrivateCiDestinations(raw),/PRIVATE_CI_POLICY_DENIED/);
});
test('policy allows only one exact repo, no executable or arbitrary source fields',()=>{
  for(const suffix of ['; touch bad',' && echo bad','/../secrets','\u001b[0m'])
    assert.throws(()=>parsePrivateCiDestinations(expected.trim()+suffix+'\n'),/PRIVATE_CI_POLICY_DENIED/);
});
