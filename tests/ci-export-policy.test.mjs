import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePrivateCiDestinations,validatePrivateCiDestinations} from '../scripts/validate-ci-export-policy.mjs';

const canonical=readFileSync(new URL('../.github/private-ci-approved-repositories.txt',import.meta.url),'utf8');
const expected='ores-rate-limit-test/atto-ci 1460083010\n';

test('proposed private destination matches its exact numeric repository identity',()=>{
  assert.deepEqual(parsePrivateCiDestinations(canonical),[
    {name:'ores-rate-limit-test/atto-ci',id:'1460083010'}
  ]);
  assert.deepEqual(parsePrivateCiDestinations('# disabled by default\n'),[]);
  assert.deepEqual(validatePrivateCiDestinations('# disabled by default\n'),[]);
  assert.throws(()=>validatePrivateCiDestinations('# disabled by default\n',{requireApproved:true}),/PRIVATE_CI_POLICY_DENIED/);
  assert.deepEqual(validatePrivateCiDestinations(canonical,{requireApproved:true}),[
    {name:'ores-rate-limit-test/atto-ci',id:'1460083010'}
  ]);
});
test('malformed, broadened and alias destinations all fail closed',()=>{
  const variants=[
    expected+expected,
    'ores-rate-limit-test/atto-ci 1351003565\n',
    'gha-indie-worker/not-our-repo 1460083010\n',
    'ore-truffle-oreslang/oreslang-source.hdl 1460083010\n',
    'gha-indie-worker/* 1460083010\n',
    'ores-rate-limit-test/atto-ci 1460083010 # inline\n',
    ' ores-rate-limit-test/atto-ci 1460083010\n',
    'ores-rate-limit-test/atto-ci\t1460083010\n',
    'Gha-indie-worker/gha-indie-worker-docs 1460083010\n',
    'ores-rate-limit-test/atto-ci 1460083010\r\n',
    '\ufeff'+expected,
    expected.trim(),
    expected+'# comment\n'+expected,
    '\u0000'+expected,
    '# escaped literal newline \\n fake authorization\n'+expected,
    '# approved\\nattacker/other-repo 123\n'+expected,
    '\\n'+expected,
    'x'.repeat(4097)
  ];
  for(const raw of variants)
    assert.throws(()=>parsePrivateCiDestinations(raw),/PRIVATE_CI_POLICY_DENIED/);
});
test('policy allows only one exact repo, no executable or arbitrary source fields',()=>{
  for(const suffix of ['; touch bad',' && echo bad','/../secrets','\u001b[0m'])
    assert.throws(()=>parsePrivateCiDestinations(expected.trim()+suffix+'\n'),/PRIVATE_CI_POLICY_DENIED/);
});
