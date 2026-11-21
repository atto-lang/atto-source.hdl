// Policy parser for a *reviewed* private CI source-transfer allowlist.
// Parsing an unmerged PR is NOT an authorization to transfer source.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const MAX_SIZE=4096;
const CANONICAL_DESTINATION='ores-rate-limit-test/atto-ci';
const CANONICAL_ID='1460083010';

export function parsePrivateCiDestinations(raw){
  if(typeof raw!=='string'||raw.length>MAX_SIZE ||raw.length===0 ||
     !raw.endsWith('\n')||raw.includes('\r') || /[^\x09\x0a\x20-\x7e]/.test(raw))
    throw new Error('PRIVATE_CI_POLICY_DENIED: invalid UTF-8/size/canonical line endings');
  const entries=[];
  for(const line of raw.slice(0,-1).split('\n')){
    if(line.startsWith('#') || line==='')continue;
    if(!/^[a-z0-9][a-z0-9.-]*\/[a-z0-9][a-z0-9._-]* [1-9][0-9]*$/.test(line))
      throw new Error('PRIVATE_CI_POLICY_DENIED: invalid/noncanonical entry');
    const [name,id]=line.split(' ');
    if(name!==CANONICAL_DESTINATION||id!==CANONICAL_ID)
      throw new Error('PRIVATE_CI_POLICY_DENIED: not an independently proposed exact repository');
    if(entries.length!==0)
      throw new Error('PRIVATE_CI_POLICY_DENIED: duplicate or multiple destination entries');
    entries.push({name,id});
  }
  return entries;
}

export function validatePrivateCiDestinations(raw,{requireApproved=false}={}){
  const entries=parsePrivateCiDestinations(raw);
  if(requireApproved && entries.length!==1)
    throw new Error('PRIVATE_CI_POLICY_DENIED: no destination on reviewed allowlist');
  return entries;
}

// A checked-in source policy is merely a proposal until the PR has an
// independent APPROVED review and is merged into the trusted source branch.
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
  try{
    const entries=validatePrivateCiDestinations(
      readFileSync('.github/private-ci-approved-repositories.txt','utf8'));
    console.log('PRIVATE_CI_DESTINATION_POLICY_VALID: '+(entries[0]?.name??'disabled by default'));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
