#!/usr/bin/env node
// Positional-only prototype. Full command flags must use flags-2-env integration.
import {open,writeFile} from 'node:fs/promises';
import {constants as flags} from 'node:fs';
import {TextDecoder} from 'node:util';

const MAX_SOURCE_BYTES=128*1024;
async function readBoundedSource(path) {
  // Protect CLI memory and avoid following symlink paths or hanging on FIFOs.
  const mask=flags.O_RDONLY|flags.O_NOFOLLOW|flags.O_NONBLOCK;
  const handle=await open(path,mask);
  try {
    const stat=await handle.stat();
    if(!stat.isFile() || stat.size>MAX_SOURCE_BYTES)
      throw new Error('HDL_SOURCE_LIMIT: input must be a regular file at most 128 KiB');
    const bytes=Buffer.alloc(MAX_SOURCE_BYTES+1);
    let offset=0;
    while(offset<bytes.length) {
      const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);
      if(!bytesRead)break;
      offset+=bytesRead;
    }
    if(offset>MAX_SOURCE_BYTES)
      throw new Error('HDL_SOURCE_LIMIT: input grew beyond 128 KiB');
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,offset));
  }finally{
    await handle.close();
  }
}
import {compileSource,compileStrictSource} from '../src/compiler.mjs';
const args=process.argv.slice(2),strict=args[0]==='--verify=strict';
if(strict)args.shift();
if(args.length!==2||args.some(a=>a.startsWith('--'))){console.error('Usage: node bin/oreslang-hdl.mjs [--verify=strict] INPUT.atto OUTPUT.sv (legacy .ores accepted)');process.exitCode=2;}
else try{
  const [src,out]=args;
  const {systemVerilog}=(strict?compileStrictSource:compileSource)(await readBoundedSource(src));
  await writeFile(out,systemVerilog,{flag:'wx'});
  console.log('Experimental RTL generated at '+out);
}catch(e){console.error(e instanceof Error?e.message:'unrecognized failure');process.exitCode=1;}
