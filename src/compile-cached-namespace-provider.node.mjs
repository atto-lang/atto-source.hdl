// Restricted trusted-host provider cache. Independently approved pins and
// immutable compiler installation; host serializes ledger epoch rotation.
// Closed explicit inventory, not a general package or synthesis cache.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isProxy} from 'node:util/types';
import {admitCheckedNamespaceProvider,emitSystemVerilog} from './compiler.mjs';
import {scalarCompilerClosureSha256} from './compile-cached-scalar-unit.node.mjs';
import {encodeCacheKey,admitLedgerRecord} from './compiler-cache-envelope.node.mjs';
import {TrustedArtifactStore} from './compiler-artifact-store.node.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const id=/^[A-Za-z_][A-Za-z0-9_]{0,127}$/;
const exactId=s=>typeof s==='string'&&id.exec(s)?.[0]===s;
const deny=s=>{throw Error('E_NAMESPACE_INVENTORY: '+s)};
export function providerCompilerClosureSha256(){
 return hash(JSON.stringify(['atto-hdl-provider-install-v1',scalarCompilerClosureSha256(),hash(readFileSync(new URL(import.meta.url)))]));
}
function inventorySnapshot(inventory){
 if(isProxy(inventory)||!Array.isArray(inventory)||Object.getPrototypeOf(inventory)!==Array.prototype||inventory.length<1||inventory.length>128)deny('member budget');
 const entries=Object.getOwnPropertyDescriptors(inventory),out=[],paths=new Set(),names=new Set();
 if(Reflect.ownKeys(entries).length!==inventory.length+1)deny('array shape');
 for(let i=0;i<inventory.length;i++){
  const e=entries[i];if(!e||!Object.hasOwn(e,'value'))deny('array accessor');
  const item=e.value;
  if(item===null||typeof item!=='object'||isProxy(item)||Object.getPrototypeOf(item)!==Object.prototype)deny('member record');
  const d=Object.getOwnPropertyDescriptors(item),fields=['path','namespace','symbol','arity','source'];
  if(Reflect.ownKeys(d).length!==fields.length||!fields.every(k=>Object.hasOwn(d,k)&&Object.hasOwn(d[k],'value')))deny('member fields');
  const {path,namespace,symbol,arity,source}=Object.fromEntries(fields.map(k=>[k,d[k].value]));
  if(typeof path!=='string'||path.length>256||!path.endsWith('.atto')||!path.slice(0,-5).split('/').every(exactId)||
   !exactId(namespace)||!exactId(symbol)||!Number.isInteger(arity)||arity<0||arity>4||
   typeof source!=='string'||source.length>4096||!source.isWellFormed()||Buffer.byteLength(source)>4096||
   paths.has(path)||names.has(namespace+'.'+symbol))deny('invalid or duplicate member');
  paths.add(path);names.add(namespace+'.'+symbol);out.push({path,namespace,symbol,arity,source});
 }
 return out.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function compileCachedNamespaceProvider({root,owner,inventory,expectedManifestSha256,expectedSourcesSha256,
 namespace,symbol,arity,expectedCompilerSha256,scope,ledgerRecord,ledgerPin,master,cold=false}={}){
 const secret=admitLedgerRecord(scope,ledgerRecord,ledgerPin,master);secret.fill(0);
 const compiler=providerCompilerClosureSha256();
 if(compiler!==expectedCompilerSha256)throw Error('E_CACHE_COMPILER: installation digest mismatch');
 const snapshot=inventorySnapshot(inventory);
 const manifest=hash('atto.hdl.provider-inventory.v1\n'+snapshot.map(p=>p.path+'\n'+p.namespace+'\n'+p.symbol+'\n'+p.arity+'\n').join(''));
 const sources=hash('atto.hdl.provider-sources.v1\n'+snapshot.map(p=>p.path+'\n'+hash(p.source)+'\n').join(''));
 if(manifest!==expectedManifestSha256||sources!==expectedSourcesSha256)throw Error('E_NAMESPACE_PIN: inventory mismatch');
 let selected,program;
 for(const p of snapshot){
  const admitted=admitCheckedNamespaceProvider(p.source,p.namespace,p.symbol,p.arity);
  if(p.namespace===namespace&&p.symbol===symbol){
   if(p.arity!==arity)throw Error('E_NAMESPACE_ARITY: incompatible selected call');
   selected=p;program=admitted;
  }
 }
 if(!selected)throw Error('E_NAMESPACE_SYMBOL: selected provider absent');
 const key=encodeCacheKey({stage:'namespace-provider-rtl-bound-input-v2',owner,unitKind:'source-unit',unit:selected.path,compiler,
   toolchain:hash(JSON.stringify([process.versions,process.platform,process.arch])),target:hash('systemverilog'),
   configuration:hash('checked-signed-i64-provider-fault-v1'),sources:hash(selected.source),
   bindings:hash(JSON.stringify([namespace,symbol,arity,selected.path])),generated:null,
   dependencies:[{identity:'provider-inventory',digest:manifest}]});
 const store=new TrustedArtifactStore(root),auth=[scope,ledgerRecord,ledgerPin,master];
 if(!cold){
   const hit=store.load(key,...auth);
   if(hit!==null)return {key,code:new TextDecoder('utf-8',{fatal:true}).decode(hit),admitted:snapshot.length,emitted:0,reused:1,retained:true};
 }
 const code=emitSystemVerilog(program),bytes=Buffer.from(code,'utf8');
 let retained=false;
 if(bytes.length<=4*1024*1024){
   try{store.publish(key,bytes,...auth);retained=true;}
   catch(e){if(!String(e.message).startsWith('E_CACHE_BUSY:'))throw e;}
 }
 return {key,code,admitted:snapshot.length,emitted:1,reused:0,retained};
}
